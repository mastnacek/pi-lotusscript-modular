import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { LspCheckResult } from "../../shared/types.js";

/**
 * DXL import oracle — the empirical check lane for DXL sources.
 *
 * The 9.0.1 compiler oracle refuses `.dxl` by name, so a DXL design export
 * would otherwise reach Designer unvalidated. This lane runs the file
 * through the REAL importer instead: `dxl_check.py` (LN_REA/docs/re/dxltests)
 * drives the headless LotusScript lane (lsrun.py) and imports the file into
 * the sandbox database (AgentRunner.nsf) with NotesDXLImporter. The file
 * does NOT need a `.dxl` extension — the manifest carries absolute paths.
 *
 * Verdict semantics (empirical, not a compile check):
 *  - OK    — the importer created a note (accepted for Designer import).
 *  - ERR   — the importer raised (e.g. err 4522 "DXL importer operation
 *            failed") or silently imported nothing; Designer would reject
 *            or the element is malformed.
 * The imported note is removed afterwards, so repeated checks leave no
 * garbage in the sandbox DB.
 */

/** 32-bit Python driving the headless LS lane (overridable for tests). */
const PY32 =
  process.env.DOMINO_DXL_PY32 ||
  "D:/01_programovani/LN_REA/domino-lsp/runtime/python32/python.exe";

/** Oracle driver (writes manifest, runs lsrun.py + dxl_check.lss, parses). */
const ORACLE =
  process.env.DOMINO_DXL_ORACLE ||
  "D:/01_programovani/LN_REA/docs/re/dxltests/dxl_check.py";

/** The native LS lane is slower than the compiler oracle: give it room. */
export const DXL_CHECK_TIMEOUT_MS = 180000;

interface OracleResult {
  file?: string;
  status?: string;
  err?: number;
  errText?: string;
  imported?: string;
  items?: string;
}

interface OracleJson {
  ok?: boolean;
  results?: OracleResult[];
  error?: string;
}

/**
 * Map the oracle's JSON stdout to a check verdict. Pure, so the rules are
 * unit-testable without running the Notes backend.
 */
export function classifyOracleOutput(rawText: string): LspCheckResult {
  let parsed: OracleJson;
  try {
    parsed = JSON.parse(rawText) as OracleJson;
  } catch {
    return {
      ok: false,
      diagnostics: `DXL import oracle returned no JSON: ${(rawText || "(empty)").slice(0, 400)}`,
      errorCount: 1,
      warningCount: 0,
    };
  }

  if (parsed.error) {
    return {
      ok: false,
      diagnostics: `DXL import oracle harness failed: ${parsed.error}`,
      errorCount: 1,
      warningCount: 0,
    };
  }

  const results = parsed.results ?? [];
  const lines: string[] = [
    "DXL import oracle (NotesDXLImporter into sandbox AgentRunner.nsf, headless LS lane):",
  ];
  let errorCount = 0;
  for (const r of results) {
    if (r.status === "OK") {
      lines.push(
        `  OK ${r.file} — accepted by the importer (${r.imported ?? "imported=?"}); items: ${r.items || "(none)"}`
      );
    } else {
      errorCount++;
      const errPart = r.err ? ` [err ${r.err}]` : "";
      lines.push(
        `  ERROR ${r.file} — the DXL importer rejected the file${errPart}: ${r.errText || "no note imported"}`
      );
    }
  }
  if (results.length === 0) {
    errorCount++;
    lines.push("  ERROR oracle produced no verdict rows");
  }

  return {
    ok: errorCount === 0,
    diagnostics: lines.join("\n"),
    errorCount,
    warningCount: 0,
  };
}

/**
 * Run one DXL file through the import oracle. The path may carry any
 * extension — the manifest passes absolute paths, not names.
 */
export async function checkDxlImport(
  filePath: string,
  timeoutMs = DXL_CHECK_TIMEOUT_MS
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
  if (!fs.existsSync(ORACLE) || !fs.existsSync(PY32)) {
    return {
      ok: false,
      diagnostics: `DXL import oracle not available (oracle: ${ORACLE}, python: ${PY32})`,
      errorCount: 1,
      warningCount: 0,
    };
  }

  return new Promise<LspCheckResult>((resolve) => {
    let proc: ReturnType<typeof spawn> | null = null;
    const timer = setTimeout(() => {
      try {
        proc?.kill();
      } catch {
        // ignore
      }
      resolve({
        ok: false,
        diagnostics: `DXL import oracle timed out after ${timeoutMs}ms (a Notes/Designer runtime may be blocking the headless LS lane)`,
        errorCount: 1,
        warningCount: 0,
      });
    }, timeoutMs);

    try {
      proc = spawn(PY32, [ORACLE, resolvedPath], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          diagnostics: `Failed to spawn the DXL import oracle: ${err.message}`,
          errorCount: 1,
          warningCount: 0,
        });
      });
      proc.on("close", () => {
        clearTimeout(timer);
        resolve(classifyOracleOutput(out.trim()));
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        ok: false,
        diagnostics: `DXL import oracle execution error: ${message}`,
        errorCount: 1,
        warningCount: 0,
      });
    }
  });
}
