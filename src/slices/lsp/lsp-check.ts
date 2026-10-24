import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { LspCheckResult } from "../../shared/types.js";
import { DEFAULT_MCP_SERVER, mcpServerCommand } from "./mcp-client.js";

export { DEFAULT_MCP_SERVER };

interface RpcResponse {
  id?: number;
  result?: {
    content?: Array<{ text?: string }>;
  };
  error?: {
    message?: string;
  };
}

interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, never>;
  clientInfo: { name: string; version: string };
}

interface ToolCallParams {
  name: string;
  arguments: { path: string };
}

type RpcParams = InitializeParams | ToolCallParams;

/**
 * Run LotusScript LSP diagnostics check on a given file.
 *
 * Two lanes can compile at the same time (the editor LSP and this MCP server), and
 * the oracle serialises them behind a sandbox lock, so a first call can lose the
 * race and time out. One retry turns that transient collision into a slow check
 * instead of a failure the agent has to report.
 */
export async function checkLotusScriptDiagnostics(
  filePath: string,
  serverScriptPath: string = DEFAULT_MCP_SERVER,
  timeoutMs = 30000
): Promise<LspCheckResult> {
  const first = await checkOnce(filePath, serverScriptPath, timeoutMs);
  if (!/timed out/i.test(first.diagnostics)) return first;

  await new Promise((r) => setTimeout(r, 750));
  const second = await checkOnce(filePath, serverScriptPath, timeoutMs);
  if (!/timed out/i.test(second.diagnostics)) return second;

  return {
    ...second,
    diagnostics:
      `${second.diagnostics}
(both attempts timed out — another checker may hold the sandbox lock, ` +
      `or a Notes/Designer runtime is blocking the oracle)`,
  };
}

/**
 * Classify a raw `lsp_diagnostics` text block. Pure, so the parsing rules are
 * unit-testable without spawning the MCP server.
 *
 * - `isClean`        — the oracle ran and reported no diagnostics.
 * - `notApplicable`  — the MCP strip refused the file BY NAME because it is
 *                      not a Domino script (e.g. a `.dxl`/`.form` handed to
 *                      `lotusscript_check`): "Error: X is not a Domino script
 *                      (expected .lss, .lsa, .fl or .formula)". That is a
 *                      domain refusal, not a compile verdict.
 * - `harnessFailed`  — the oracle could not run at all; never a code verdict.
 * - otherwise        — ERROR/WARN markers are counted from line-leading
 *                      markers only; any other non-empty text counts as one
 *                      error (the oracle reports the FIRST error it hits, so
 *                      an unmarked refusal must not read as "clean").
 */
export interface DiagnosticsClassification {
  isClean: boolean;
  notApplicable: boolean;
  harnessFailed: boolean;
  errorCount: number;
  warningCount: number;
}

export function classifyDiagnostics(rawText: string): DiagnosticsClassification {
  const lower = rawText.toLowerCase();
  // Rust domino-mcp: "✔ Clean: no compiler diagnostics".
  // Legacy JS server: "no diagnostics". Both mean the compile was clean.
  const isClean =
    !rawText || lower.includes("no compiler diagnostics") || lower.includes("no diagnostics");

  // notes-sys `domino-mcp.exe` rejects files outside its compiler lanes by
  // name. A `.dxl` design export or a `.form` submitted to the check lane is
  // "not applicable", not a compilation failure.
  const notApplicable = /is not a domino script/i.test(rawText);

  // The oracle could not run at all (worker missing, spawn/compile
  // failure). That is a harness problem, never a code verdict.
  const harnessFailed =
    !isClean &&
    !notApplicable &&
    /^(oracle worker process is not running|error compiling file|lsp query error|lsp execution error|failed to spawn)/i.test(
      rawText
    );

  let errorCount = 0;
  let warningCount = 0;

  if (!isClean && !notApplicable) {
    const lines = rawText.split("\n");
    for (const l of lines) {
      // Severity comes from the line's leading marker only:
      //   "  ERROR <path>:<line>:<col> [CODE] message"
      // Scanning the whole line misfires when a message merely mentions
      // an error ("Maximum number of errors reached", "its error cap").
      const marker = /^\s*(ERROR|WARN(?:ING)?)\b/i.exec(l);
      if (!marker) continue;
      if (marker[1]?.toUpperCase() === "ERROR") errorCount++;
      else warningCount++;
    }
    if (errorCount === 0 && warningCount === 0 && rawText.length > 0) {
      errorCount = 1;
    }
  }

  return { isClean, notApplicable, harnessFailed, errorCount, warningCount };
}

async function checkOnce(
  filePath: string,
  serverScriptPath: string,
  timeoutMs: number
): Promise<LspCheckResult> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      diagnostics: `File not found: ${resolvedPath}`,
      errorCount: 1,
      warningCount: 0,
    };
  }

  if (!fs.existsSync(serverScriptPath)) {
    return {
      ok: false,
      diagnostics: `LotusScript LSP server not found at: ${serverScriptPath}`,
      errorCount: 1,
      warningCount: 0,
    };
  }

  return new Promise<LspCheckResult>((resolve) => {
    let proc: ReturnType<typeof spawn> | null = null;
    let timer: NodeJS.Timeout | null = null;
    let finished = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (proc) {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
    };

    timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        cleanup();
        resolve({
          ok: false,
          diagnostics:
            `LSP check timed out after ${timeoutMs}ms. The compiler oracle did not answer: ` +
            "either another checker still holds the sandbox lock, or a Notes/Designer runtime is " +
            "blocking its start (dismiss any Notes dialog and retry).",
          errorCount: 1,
          warningCount: 0,
        });
      }
    }, timeoutMs);

    try {
      const { command, args } = mcpServerCommand(serverScriptPath);
      proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let buf = "";
      const pending = new Map<number, (val: RpcResponse) => void>();
      let nextId = 1;

      if (proc.stdout) {
        proc.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const msg = JSON.parse(line) as RpcResponse;
              if (msg.id !== undefined && pending.has(msg.id)) {
                const handler = pending.get(msg.id)!;
                pending.delete(msg.id);
                handler(msg);
              }
            } catch {
              // Ignore non-json or partial lines
            }
          }
        });
      }

      proc.on("error", (err: Error) => {
        if (!finished) {
          finished = true;
          cleanup();
          resolve({
            ok: false,
            diagnostics: `Failed to spawn LSP process: ${err.message}`,
            errorCount: 1,
            warningCount: 0,
          });
        }
      });

      const rpc = (method: string, params: RpcParams) => {
        const id = nextId++;
        return new Promise<RpcResponse>((res) => {
          pending.set(id, res);
          proc?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        });
      };

      (async () => {
        try {
          await rpc("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "pi-lotusscript-modular", version: "1.0.0" },
          });

          proc?.stdin?.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
          );

          await new Promise((r) => setTimeout(r, 100));

          const res = await rpc("tools/call", {
            name: "lsp_diagnostics",
            arguments: { path: resolvedPath },
          });

          const rawText: string = (res.result?.content?.[0]?.text ?? "").trim();
          const { notApplicable, harnessFailed, errorCount, warningCount } =
            classifyDiagnostics(rawText);

          if (!finished) {
            finished = true;
            cleanup();
            resolve({
              // A warning is not a failure: the check exists to report compiler
              // ERRORS. Warnings stay visible in `diagnostics` and in the count.
              // A file the oracle refuses by name (e.g. a .dxl design export) is
              // skipped, not failed: `ok` stays true and `skipped` marks it.
              ok: !harnessFailed && errorCount === 0,
              skipped: notApplicable,
              diagnostics: rawText || "No diagnostics.",
              errorCount: harnessFailed ? 0 : errorCount,
              warningCount: harnessFailed ? 0 : warningCount,
            });
          }
        } catch (err: unknown) {
          if (!finished) {
            finished = true;
            cleanup();
            const message = err instanceof Error ? err.message : String(err);
            resolve({
              ok: false,
              diagnostics: `LSP query error: ${message}`,
              errorCount: 1,
              warningCount: 0,
            });
          }
        }
      })();
    } catch (err: unknown) {
      if (!finished) {
        finished = true;
        cleanup();
        const message = err instanceof Error ? err.message : String(err);
        resolve({
          ok: false,
          diagnostics: `LSP execution error: ${message}`,
          errorCount: 1,
          warningCount: 0,
        });
      }
    }
  });
}
