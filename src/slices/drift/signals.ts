/**
 * Drift slice — pure detection of code that belongs in a script library.
 *
 * The patterns are the invariants we keep re-checking by hand: an HTTP COM
 * object outside the transport library, a hard-coded API path, a hand-rolled
 * error report, a hand-built `notes://` URL. Each one has a documented home in
 * `libraries-and-versioning.md`; the notice points there instead of repeating
 * the rule.
 */

export interface DriftSignal {
  id: string;
  /** Short human label used in the notice. */
  label: string;
  pattern: RegExp;
  /** Reference anchor the agent should read before refactoring. */
  reference: string;
}

const REF_PROMOTION = "references/libraries-and-versioning.md (§1, when code belongs in a library)";
const REF_MIGRATION = "references/libraries-and-versioning.md (§5, migrating callers)";

export const DRIFT_SIGNALS: readonly DriftSignal[] = [
  {
    id: "http-com",
    label: "HTTP COM object created outside the transport library",
    pattern: /CreateObject\s*\(\s*"(?:WinHttp\.WinHttpRequest|MSXML2\.ServerXMLHTTP)/i,
    reference: REF_MIGRATION,
  },
  {
    id: "endpoint",
    label: "hard-coded API endpoint path",
    pattern: /["']\/api\/[a-z0-9]/i,
    reference: REF_PROMOTION,
  },
  {
    id: "error-report",
    label: "locally assembled error report",
    pattern: /^\s*(?:Public\s+)?(?:Sub|Function)\s+\w*(?:SendError|SendDiagnostic|PosliChybovyReport)\w*/im,
    reference: REF_PROMOTION,
  },
  {
    id: "notes-url",
    label: "hand-built notes:// URL",
    pattern: /"notes:\/\/"/i,
    reference: REF_PROMOTION,
  },
];

export interface DriftHit {
  signal: DriftSignal;
  /** 1-based line numbers, first few only — enough to locate the block. */
  lines: number[];
}

/** Line numbers of every signal occurrence, with matches grouped per signal. */
export function findDrift(text: string): DriftHit[] {
  const lines = text.split(/\r?\n/);
  const hits: DriftHit[] = [];

  for (const signal of DRIFT_SIGNALS) {
    const found: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Comments are documentation, not drift.
      if (line.trimStart().startsWith("'")) continue;
      if (signal.pattern.test(line)) found.push(i + 1);
      if (found.length >= 3) break;
    }
    if (found.length > 0) hits.push({ signal, lines: found });
  }

  return hits;
}

/** A file whose element name starts with `lib_` IS the library — never drift. */
export function isLibraryFile(filePath: string): boolean {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return /^lib_/i.test(base);
}
