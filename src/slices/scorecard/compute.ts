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
 * Deterministic, plugin-computed evaluation of one modular LotusScript agent.
 * Pure function: takes plain data, returns a plain scorecard.
 *
 * This is the "how you're graded" signal. It is never derived from model output.
 */
export function computeScorecard(input: ScorecardInput): AgentScorecard {
  const items: ScorecardItem[] = [];

  // DoD 1 — procedure length
  const exceeded = input.lint.exceededProcedures;
  items.push({
    id: "proc-limit",
    label: `procedures ≤ ${input.maxProcedureLines} lines`,
    ok: exceeded.length === 0,
    weight: 2,
    detail:
      exceeded.length > 0
        ? condense(exceeded.map((p) => `${p.fileName} (${p.lineCount})`).join(", "), 1)
        : undefined,
  });

  // DoD 2 — Czech purpose comments
  if (input.enforceCzechComments) {
    const total = input.lint.allItems.length;
    const missing = input.lint.missingCommentProcedures;
    items.push({
      id: "proc-comments",
      label: `Czech purpose comments (${total - missing.length}/${total})`,
      ok: missing.length === 0,
      weight: 2,
      detail: missing.length > 0 ? condense(missing.map((p) => p.fileName).join(", "), 1) : undefined,
    });
  }

  // DoD 3 — LSP diagnostics.
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

  // DoD 4 — manifest sync
  items.push({
    id: "manifest-sync",
    label: "manifest.json in sync",
    ok: input.manifestSynced,
    weight: 2,
  });

  // DoD 5 — final artifact. Mid-work compiles report it as pending (⬜) rather
  // than failed, so incremental progress is not punished.
  items.push({
    id: "artifact",
    label: "final artifact written",
    ok: input.artifact === "written",
    pending: input.artifact === "pending",
    weight: 2,
  });

  // DoD 6 (Optional) — JEV semantic review (new style comments & runtime risk)
  if (input.jev) {
    const isClean = input.jev.ok;
    const riskLevels = ["low", "medium", "high"];
    const riskLabel = riskLevels[input.jev.maxGotchaRisk] ?? "high";
    const styleLabel = `JEV semantic review (${input.jev.newStyleCount} new, ${input.jev.oldStyleCount} old style, risk: ${riskLabel})`;
    items.push({
      id: "jev-semantic",
      label: styleLabel,
      ok: isClean,
      weight: 2,
      detail: input.jev.summary ? condense(input.jev.summary, 1) : undefined,
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
  if (!previous) return "(first compile)";
  const delta = current.score - previous.score;
  if (delta > 0) return `▲ +${delta} since last compile`;
  if (delta < 0) return `▼ ${delta} since last compile`;
  return "= no change since last compile";
}

/**
 * Compact, stable text block injected into the compile result.
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
 * Static rules only — live numbers belong in the per-compile scorecard.
 */
export function buildGradingRubric(config: ModularConfig): string {
  const n = config.maxProcedureLines;

  const commentRule = config.enforceCzechComments
    ? "2. Every sub/function carries a concise Czech purpose comment (' Účel: ...)."
    : "2. (Czech purpose comments are disabled by config.)";

  const lspRule = config.enableLsp
    ? "3. The compiled artifact reports 0 LSP errors."
    : "3. (LSP validation is disabled by config.)";

  const jevRule = config.useJevEvaluation
    ? "6b. Comments are in the new style with verified Czech purpose (' Účel: ...) assessed by JEV."
    : undefined;

  return [
    "LOTUSSCRIPT DEFINITION OF DONE (per agent you touch):",
    `1. No procedure exceeds ${n} lines, unless the user approved an exception.`,
    commentRule,
    lspRule,
    "4. manifest.json compilationOrder matches the files on disk.",
    "5. The final artifact is written: original .lss overwritten, or <Agent>.lss created for .dxl.",
    "6. Every newly discovered trap is proposed via lotusscript_gotchas(action: \"add\") and user-approved.",
    ...(jevRule ? [jevRule] : []),
    "",
    "HOW YOU'RE GRADED (the plugin computes this — never self-report a score):",
    "  +2 per satisfied DoD item",
    "  -5 per LSP error remaining at final compile",
    `  -5 per procedure over ${n} lines without an approved exception`,
    "  -3 per procedure missing its Czech purpose comment",
    "  INSTANT FAILURE: editing 'main.lss' (synthetic index, regenerated on every compile)",
    "  INSTANT FAILURE: editing '*_compiled.lss' (generated artifact)",
    "  INSTANT FAILURE: hand-editing 'manifest.json' inside a modular root (auto-synced from disk)",
    "  INSTANT FAILURE: dumping a monolithic '.lss'/'.dxl' via a shell/code tool (cat, sed, head, tail, Get-Content, python, node) — the 'read' tool redirects to the modular folder for you",
    "  ADVISORY: writing a LotusScript file outside the active modular root",
    "  A live scorecard is attached to every compile result — treat it as your feedback signal.",
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
 * Line numbers, columns and file paths are normalised away — they change on
 * every edit even when the underlying fault is identical.
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
      .replace(/\b(?:line|column|row)\s+\d+\b/gi, "line <n>")
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