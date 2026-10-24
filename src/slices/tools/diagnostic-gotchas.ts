/**
 * Diagnostic → gotcha matching for `lotusscript_check`.
 *
 * The check result is the moment the agent has an error text in hand, so the
 * catalogue entries that already describe that text are surfaced right there
 * instead of relying on the model to remember the separate search step.
 *
 * Pure: the caller injects the catalogue search (slices never import each
 * other; the composition root wires the seam through ToolsDeps).
 */

export interface DiagnosticGotcha {
  id: string;
  title: string;
  body: string;
}

/** Minimum phrase length worth a catalogue query — shorter is noise. */
const MIN_PHRASE = 10;

/**
 * Query phrases extracted from compiler diagnostics, most specific first.
 * Strips the `path:line:col [LS-code]` prefix and then narrows the message
 * (clause before `:` → full text → first four words) until a phrase is
 * specific enough to search for. The clause comes first because a compiler
 * message appends case-specific details (`Variable not declared: X`) that the
 * catalogue text does not contain.
 */
export function diagnosticQueries(diagnostics: string, max = 4): string[] {
  const phrases: string[] = [];
  const lines = diagnostics.split(/\r?\n/);

  for (const line of lines) {
    if (!/(^|\s)(ERROR|WARNING|Error|Warning)(\s|:)/.test(line) && !/\[LS-[0-9a-zA-Zx]+\]/.test(line)) {
      continue;
    }
    const afterCode = line.includes("]") ? line.slice(line.lastIndexOf("]") + 1) : line;
    const message = afterCode
      .replace(/^[\s:–-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (message.length < MIN_PHRASE) continue;

    const candidates = [
      message.split(/[:(]/)[0]?.trim() ?? "",
      message,
      message.split(/\s+/).slice(0, 4).join(" "),
    ];
    for (const candidate of candidates.slice(0, 2)) {
      if (candidate.length >= MIN_PHRASE && !phrases.includes(candidate)) phrases.push(candidate);
    }
    if (phrases.length >= max) break;
  }
  return phrases.slice(0, max);
}

/**
 * Catalogue entries whose title or body contains one of the diagnostic
 * phrases. A hit must actually contain the phrase, so a fuzzy search result
 * alone never becomes a match.
 */
export function matchDiagnosticGotchas(
  diagnostics: string,
  search: (query: string, limit?: number) => DiagnosticGotcha[],
  limit = 3,
): DiagnosticGotcha[] {
  const found = new Map<string, { hit: DiagnosticGotcha; score: number }>();

  for (const phrase of diagnosticQueries(diagnostics)) {
    let hits: DiagnosticGotcha[];
    try {
      hits = search(phrase, 5);
    } catch {
      continue;
    }
    const needle = phrase.toLowerCase();
    for (const hit of hits) {
      // A title match beats a body mention: the title is the trigger, while a
      // body may mention the phrase in passing (e.g. a related trap).
      const score =
        (hit.title.toLowerCase().includes(needle) ? 2 : 0) +
        (hit.body.toLowerCase().includes(needle) ? 1 : 0);
      if (score === 0) continue;
      const prev = found.get(hit.id);
      if (!prev || score > prev.score) found.set(hit.id, { hit, score });
    }
  }

  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.hit);
}

/** Model-facing (English) block appended to a check result. */
export function formatDiagnosticGotchas(hits: DiagnosticGotcha[]): string {
  if (hits.length === 0) return "";
  const lines = ["🧩 GOTCHA MATCHES for this diagnostic (read them before fixing):"];
  for (const hit of hits) {
    const gist = hit.body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    lines.push(`  • ${hit.title}`);
    if (gist) lines.push(`    ${gist.slice(0, 200)}`);
  }
  lines.push("  Full text: tool 'lotusscript_gotchas' with the exact error text.");
  return lines.join("\n");
}
