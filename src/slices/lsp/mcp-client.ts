/**
 * MCP-over-stdio client helpers for the automation lane (SPAI-008).
 *
 * The MCP protocol is pull-only, so automatic invocation of the MCP-only
 * features (lsp_explain, lsp_format) lives HERE: pipeline hooks call these
 * helpers on file events instead of waiting for the model to ask.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface RpcResponse {
  id?: number;
  result?: {
    content?: Array<{ text?: string }>;
  };
  error?: {
    message: string;
  };
}

/**
 * MCP server the check/automation lane talks to: the Rust `domino-mcp.exe`
 * shipped by notes-sys, which fronts the same 9.0.1 compiler oracle that the
 * editor lane (pi-lens) uses through `domino-lsp.exe`.
 *
 * One engine, one set of diagnostics. The legacy JS stack
 * (`RESOURCES-NOTES/agent-lsp-mcp/server.js` → `LN_REA/domino-lsp/src/lsp-server.js`)
 * is no longer used by default; point `LOTUSSCRIPT_MCP_SERVER` at a `.js` file
 * to fall back to it.
 */
export const DEFAULT_MCP_SERVER =
  process.env.LOTUSSCRIPT_MCP_SERVER ||
  "D:/01_programovani/LN_REA/notes-sys/target/i686-pc-windows-msvc/release/domino-mcp.exe";

/**
 * Command line for an MCP server path: a `.js/.mjs/.cjs` file runs under the
 * current Node binary, anything else is executed directly (the Rust exe).
 */
export function mcpServerCommand(serverPath: string): { command: string; args: string[] } {
  return /\.(?:js|mjs|cjs)$/i.test(serverPath)
    ? { command: process.execPath, args: [serverPath] }
    : { command: serverPath, args: [] };
}
async function withMcpClient<T>(
  serverScriptPath: string,
  timeoutMs: number,
  use: (call: (method: string, params: unknown) => Promise<RpcResponse>) => Promise<T>
): Promise<T> {
  if (!fs.existsSync(serverScriptPath)) {
    throw new Error(`LotusScript LSP server not found at: ${serverScriptPath}`);
  }

  return new Promise<T>((resolve, reject) => {
    let proc: ReturnType<typeof spawn> | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (proc) {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
      fn();
    };

    timer = setTimeout(() => {
      finish(() => reject(new Error(`MCP client timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    try {
      const { command, args } = mcpServerCommand(serverScriptPath);
      proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

      let buf = "";
      const pending = new Map<number, (val: RpcResponse) => void>();
      let nextId = 1;

      proc.on("error", (err) => finish(() => reject(err)));

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
              // ignore partial / non-json lines
            }
          }
        });
      }

      const call = (method: string, params: unknown): Promise<RpcResponse> => {
        const id = nextId++;
        return new Promise<RpcResponse>((res, rej) => {
          pending.set(id, (msg) => {
            if (msg.error) rej(new Error(msg.error.message));
            else res(msg);
          });
          try {
            proc?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
          } catch (err) {
            pending.delete(id);
            rej(err instanceof Error ? err : new Error(String(err)));
          }
        });
      };

      (async () => {
        try {
          await call("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "pi-lotusscript-modular", version: "1.0.0" },
          });
          proc?.stdin?.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
          );
          await new Promise((r) => setTimeout(r, 100));
          const result = await use(call);
          finish(() => resolve(result));
        } catch (err) {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      })();
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

const EXPLAIN_CODE_RE = /(?:LS|FORMULA)-0x[0-9a-fA-F]{4}/g;

/** Extract distinct LS-0x… / FORMULA-0x… codes from a diagnostics text block.
 *  Normalized to the form lsp_explain expects: uppercase prefix + lowercase
 *  hex (e.g. `LS-0xd028`, `FORMULA-0x051b`). */
export function extractLspErrorCodes(diagnosticsText: string, cap = 3): string[] {
  const seen = new Set<string>();
  for (const match of diagnosticsText.matchAll(EXPLAIN_CODE_RE)) {
    const raw = match[0];
    const sep = raw.indexOf("-0x");
    seen.add(raw.slice(0, sep).toUpperCase() + raw.slice(sep).toLowerCase());
    if (seen.size >= cap) break;
  }
  return [...seen];
}

/**
 * Auto-explain: fetch full lsp_explain help pages for up to 3 distinct error
 * codes found in a diagnostics text. Returns markdown, or "" when the MCP
 * lane is unavailable or no page adds value.
 */
export async function explainLotusScriptCodes(
  diagnosticsText: string,
  serverScriptPath: string = DEFAULT_MCP_SERVER,
  timeoutMs = 15000
): Promise<string> {
  const codes = extractLspErrorCodes(diagnosticsText);
  if (!codes.length) return "";
  try {
    return await withMcpClient(serverScriptPath, timeoutMs, async (call) => {
      const parts: string[] = [];
      for (const code of codes) {
        const res = await call("tools/call", {
          name: "lsp_explain",
          arguments: { code },
        });
        const text = (res.result?.content?.[0]?.text ?? "").trim();
        if (text && !/^No help entry/i.test(text)) {
          parts.push(`📚 Help for ${code}:\n${text}`);
        }
      }
      return parts.join("\n\n");
    });
  } catch {
    return "";
  }
}

/**
 * Auto-format: ask the LSP formatter for the file and return the full
 * formatted text, or null when nothing changed / the lane is unavailable.
 * The CALLER owns writing the file (encoding policy stays with the pipeline).
 */
export async function formatLotusScriptFile(
  filePath: string,
  serverScriptPath: string = DEFAULT_MCP_SERVER,
  timeoutMs = 10000
): Promise<string | null> {
  try {
    return await withMcpClient(serverScriptPath, timeoutMs, async (call) => {
      const res = await call("tools/call", {
        name: "lsp_format",
        arguments: { path: path.resolve(filePath) },
      });
      const text = res.result?.content?.[0]?.text ?? "";
      if (!text.trim() || /^No formatting changes/i.test(text.trim())) return null;
      return text;
    });
  } catch {
    return null;
  }
}
