import type {
  AgentScorecard,
  LspCheckResult,
  ModularConfig,
  ScorecardInput,
  ScorecardItem,
} from "../../shared/types.js";

const ICON_OK = "✅";
const ICON_FAIL = "❌";
const ICON_PENDING = "⬜";

const MAX_DETAIL_CHARS = 160;

/** Icon for a scorecard item: pending → blank, ok → check, failed → cross. */
function itemIcon(item: ScorecardItem): string {
  if (item.pending) return ICON_PENDING;
  return item.ok ? ICON_OK : ICON_FAIL;
}

/** Collapses a multi-line detail blob to at most `maxLines` lines, trimmed to a sane length. */
function condense(text: string, maxLines = 3): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  if (lines.length === 0) return undefined;
  const joined = lines.join(" | ");
  return joined.length > MAX_DETAIL_CHARS ? `${joined.slice(0, MAX_DETAIL_CHARS)}…` : joined;
}

/**
 * Deterministic, plugin-computed evaluation of one whole LotusScript file.
 * Pure function: takes plain data, returns a plain scorecard.
 *
 * This is the "how you're graded" signal. It is never derived from model output.
 */
export function computeScorecard(input: ScorecardInput): AgentScorecard {
  const items: ScorecardItem[] = [];

  // DoD 1 — Czech purpose comments
  if (input.enforceCzechComments) {
    const total = input.lint.allItems.length;
    const missing = input.lint.missingCommentProcedures;
    items.push({
      id: "proc-comments",
      label: `Czech purpose comments (${total - missing.length}/${total})`,
      ok: missing.length === 0,
      weight: 2,
      detail: missing.length > 0 ? condense(missing.map((p) => p.procedureName).join(", "), 1) : undefined,
    });
  }

  // DoD 2 — LSP diagnostics.
  // A check that did not run (no result) or failed on the harness side (server
  // missing, timeout, query error) is "not measured" — never "failed". Grading
  // an absent result as a failure produced the self-contradictory
  // "❌ LSP diagnostics (0 errors)" line in the final debrief.
  if (input.lspEnabled) {
    const lsp = input.lsp;
    const measured = !!lsp && !isLspHarnessFailure(lsp);
    const errs = lsp?.errorCount ?? 0;
    items.push({
      id: "lsp-clean",
      label: measured
        ? `LSP diagnostics (${errs} error${errs === 1 ? "" : "s"})`
        : "LSP diagnostics (not checked)",
      ok: measured && !!lsp?.ok,
      pending: !measured,
      weight: 2,
      detail: lsp && !lsp.ok ? condense(lsp.diagnostics) : undefined,
    });
  }

  // DoD 3 — KB verification. Scored only when a KB enforcement toggle is on;
  // a user who disabled all KB machinery is not punished for skipping it.
  // Plural by design: one call per KB layer (reference / book / community).
  if (input.kbExpected) {
    items.push({
      id: "kb-consulted",
      label: `lotus-notes KB consulted (${Math.min(input.kbSearchCount, input.minKbSearches)}/${input.minKbSearches})`,
      ok: input.kbSearchCount >= input.minKbSearches,
      weight: 2,
      detail:
        input.kbSearchCount >= input.minKbSearches
          ? undefined
          : "run kb_search once per layer: IBM API reference, Guirard book (performance), community/error text",
    });
  }

  const scored = items.filter((i) => !i.pending);
  const score = scored.filter((i) => i.ok).reduce((s, i) => s + i.weight, 0);
  const max = scored.reduce((s, i) => s + i.weight, 0);

  return { agent: input.agent, score, max, items, ts: new Date().toISOString() };
}

/**
 * Trend line relative to the previous scorecard for the same agent.
 */
export function trendLabel(current: AgentScorecard, previous?: AgentScorecard): string {
  if (!previous) return "(first check)";
  const delta = current.score - previous.score;
  if (delta > 0) return `▲ +${delta} since last check`;
  if (delta < 0) return `▼ ${delta} since last check`;
  return "= no change since last check";
}

/**
 * Compact, stable text block injected into the check result.
 * Format is intentionally fixed so the model can read it as a signal.
 */
export function formatScorecard(current: AgentScorecard, previous?: AgentScorecard): string {
  const lines: string[] = [
    `📊 SCORECARD  ${current.agent}  ${current.score}/${current.max}  ${trendLabel(current, previous)}`,
  ];

  for (const item of current.items) {
    lines.push(`  ${itemIcon(item)} ${item.label}`);
  }
  const remaining = current.items.filter((i) => !i.ok && !i.pending);
  if (remaining.length > 0) {
    lines.push("  Remaining:");
    for (const r of remaining) {
      lines.push(`    - ${r.label}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }

  return lines.join("\n");
}

/**
 * LotusScript Definition of Done + grading rubric injected into the system prompt.
 * Static rules only — live numbers belong in the per-check scorecard.
 */
export function buildGradingRubric(config: ModularConfig): string {
  const commentRule = config.enforceCzechComments
    ? "1. Every sub/function carries a concise Czech purpose comment (' Účel: ...)."
    : "1. (Czech purpose comments are disabled by config.)";

  const kbExpected = config.enforceKbPrompt || config.enforceKbGate || config.verifyKbBeforeSettle;
  const kbRule = kbExpected
    ? `3. The lotus-notes knowledge base was consulted at least ${config.minKbSearchesPerRun}× per run (kb_search) — once per layer: IBM API reference, Guirard book, community/error text.`
    : "3. (KB verification is disabled by config.)";

  const lspRule = config.enableLsp
    ? "2. The whole .lss file reports 0 LSP errors (verified with lotusscript_check)."
    : "2. (LSP validation is disabled by config.)";

  return [
    "LOTUSSCRIPT DEFINITION OF DONE (per .lss file you touch):",
    commentRule,
    lspRule,
    kbRule,
    "",
    "HOW YOU'RE GRADED (the plugin computes this — never self-report a score):",
    "  +2 per satisfied DoD item",
    "  -5 per LSP error remaining at the final whole-file check",
    "  -3 per procedure missing its Czech purpose comment",
    "  INSTANT FAILURE: creating a modular folder (manifest.json / main.lss / sub_*.lss) — the modular workflow was removed; every .lss is a whole script",
    "  A live scorecard is attached to every check result — treat it as your feedback signal.",
  ].join("\n");
}

/** Diagnostics that carry no code-level signal (clean runs, harness failures). */
const DIAGNOSTIC_NOISE =
  /^(no diagnostics|ok\b|lsp check timed out|lsp query error|lsp execution error|lotusscript lsp server not found|file not found|failed to spawn)/i;

/**
 * True when an LSP result carries no code-level signal: the check itself failed
 * to run (server not found, timeout, query error). Such a result must be scored
 * as pending rather than as an unmet requirement, otherwise a harness problem
 * silently docks the agent's score.
 */
function isLspHarnessFailure(lsp: LspCheckResult): boolean {
  if (lsp.ok) return false;
  const firstLine = lsp.diagnostics.trim().split(/\r?\n/)[0] ?? "";
  return DIAGNOSTIC_NOISE.test(firstLine);
}

/**
 * Reduces a diagnostics blob to stable, location-free signatures so the same
 * underlying compiler/LSP problem is recognised across compile cycles.
 *
 * Line numbers, columns (`col 9` / `column 9`) and file paths are normalised
 * away — they change on every edit even when the underlying fault is identical,
 * so the same fault must not look new merely because it moved a few columns.
 */
export function normalizeDiagnostics(diagnostics: string): string[] {
  const seen = new Set<string>();
  const signatures: string[] = [];

  for (const raw of diagnostics.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || DIAGNOSTIC_NOISE.test(line)) continue;

    const signature = line
      .replace(/[A-Za-z]:[\\/][^\s;,()]+/g, "<path>")
      .replace(/\b[\w.-]+\.(?:lss|dxl|txt|log)\b/gi, "<file>")
      .replace(/\(\s*\d+\s*[;,:]\s*\d+\s*\)/g, "(<loc>)")
      .replace(/:\s*\d+(?:\s*[;,:]\s*\d+)?/g, ": <loc>")
      .replace(/\b(?:line|column|col|row)\s+\d+\b/gi, "line <n>")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

    if (signature.length < 8 || seen.has(signature)) continue;
    seen.add(signature);
    signatures.push(signature);
  }

  return signatures;
}

/**
 * Signatures present in the current cycle that also occurred in at least
 * `minCycles - 1` previous cycles (i.e. recurring, not a one-off).
 */
export function findRecurringSignatures(
  current: readonly string[],
  history: readonly (readonly string[])[],
  minCycles = 2
): string[] {
  const needed = Math.max(1, minCycles - 1);
  return current.filter(
    (sig) => history.filter((cycle) => cycle.includes(sig)).length >= needed
  );
}

/**
 * Drafts a gotcha from a recurring diagnostic so the harness — not the model —
 * produces the learning record. Always routed through the user approval modal.
 */
export function buildRecurringGotchaDraft(
  agent: string,
  signatures: readonly string[],
  editedFiles: readonly string[]
): { title: string; body: string } {
  const primary = signatures[0] ?? "unknown diagnostic";
  const files = editedFiles.length > 0 ? editedFiles.join(", ") : "n/a";

  return {
    title: `Recurring LotusScript diagnostic in ${agent}: ${primary.slice(0, 80)}`,
    body: [
      `**Recurring failure detected by the harness** — the same diagnostic appeared in at least two compile cycles of \`${agent}\`.`,
      "",
      "Diagnostic signature(s):",
      ...signatures.map((s) => `- \`${s}\``),
      "",
      `Files edited in the failing cycles: ${files}`,
      "",
      "Record the concrete cause and the fix so this trap is not repeated.",
    ].join("\n"),
  };
}