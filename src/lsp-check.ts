import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface LspCheckResult {
  ok: boolean;
  diagnostics: string;
  errorCount: number;
  warningCount: number;
}

const DEFAULT_SERVER_JS = "D:/01_programovani/RESOURCES-NOTES/agent-lsp-mcp/server.js";

/**
 * Run LotusScript LSP diagnostics check on a given file.
 */
export async function checkLotusScriptDiagnostics(
  filePath: string,
  serverScriptPath: string = process.env.LOTUSSCRIPT_MCP_SERVER || DEFAULT_SERVER_JS,
  timeoutMs = 10000
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
          diagnostics: `LSP check timed out after ${timeoutMs}ms`,
          errorCount: 1,
          warningCount: 0,
        });
      }
    }, timeoutMs);

    try {
      proc = spawn("node", [serverScriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let buf = "";
      const pending = new Map<number, (val: RpcResponse) => void>();
      let nextId = 1;

      interface RpcResponse {
        id?: number;
        result?: {
          content?: Array<{ text?: string }>;
        };
        error?: {
          message?: string;
        };
      }

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

          // Give server a small tick
          await new Promise((r) => setTimeout(r, 100));

          const res = await rpc("tools/call", {
            name: "lsp_diagnostics",
            arguments: { path: resolvedPath },
          });

          const rawText: string = (res.result?.content?.[0]?.text ?? "").trim();
          const isClean =
            !rawText ||
            rawText.toLowerCase().includes("no diagnostics") ||
            rawText === "";

          let errorCount = 0;
          let warningCount = 0;

          if (!isClean) {
            const lines = rawText.split("\n");
            for (const l of lines) {
              if (/\bERROR\b/i.test(l)) errorCount++;
              else if (/\bWARN(?:ING)?\b/i.test(l)) warningCount++;
            }
            if (errorCount === 0 && warningCount === 0 && rawText.length > 0) {
              // Any unexpected output treated as error
              errorCount = 1;
            }
          }

          if (!finished) {
            finished = true;
            cleanup();
            resolve({
              ok: isClean || errorCount === 0,
              diagnostics: rawText || "No diagnostics.",
              errorCount,
              warningCount,
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
