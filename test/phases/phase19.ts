/**
 * Phase 19 (tests 93–96): proactive KB verification — the scorecard DoD item,
 * the query-recipe guideline, and the per-agent suggested KB queries in the
 * read banner.
 */

import { computeScorecard } from "../../src/slices/scorecard/index.js";
import { buildPromptGuidelines } from "../../src/slices/pipeline/guidelines.js";
import { suggestedKbQueries } from "../../src/slices/pipeline/read-banner.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import type { ScorecardInput } from "../../src/shared/types.js";

function report(num: string, label: string, ok: boolean): void {
  console.log(`${num}. ${label}:`, ok ? "PASS" : "FAIL");
  if (!ok) throw new Error(`Phase 19 check ${num} failed: ${label}`);
}

function baseInput(): ScorecardInput {
  return {
    agent: "KbAgent",
    maxProcedureLines: 300,
    lint: { ok: true, exceededProcedures: [], missingCommentProcedures: [], allItems: [] },
    lsp: null,
    lspEnabled: false,
    enforceCzechComments: false,
    manifestSynced: true,
    artifact: "written",
    kbExpected: true,
    kbConsulted: true,
  };
}

export async function phase19(): Promise<void> {
  // --- 93: the KB DoD item scores consultation deterministically ---
  const consulted = computeScorecard(baseInput());
  const unconsulted = computeScorecard({ ...baseInput(), kbConsulted: false });
  const excluded = computeScorecard({ ...baseInput(), kbExpected: false });
  const kbItem = (sc: ReturnType<typeof computeScorecard>) =>
    sc.items.find((i) => i.id === "kb-consulted");
  report(
    "93",
    "scorecard grades KB consultation (+2 when consulted, fails when not, omitted when KB enforcement is off)",
    kbItem(consulted)?.ok === true &&
      consulted.score === consulted.max &&
      kbItem(unconsulted)?.ok === false &&
      unconsulted.score === unconsulted.max - 2 &&
      kbItem(excluded) === undefined &&
      excluded.score === excluded.max
  );

  // --- 94: the KB guideline is a task→layer query protocol with a quality bar ---
  const guidelines = buildPromptGuidelines(DEFAULT_CONFIG, {
    buildGradingRubric: () => "",
  } as never);
  const kb = guidelines.find((g) => g.includes("KB PROTOCOL")) ?? "";
  report(
    "94",
    "KB guideline carries query recipes (API / Guirard / error text) and the quality bar (On Error, object state, NoCache)",
    kb.includes("Guirard") &&
      kb.includes("exact error text") &&
      kb.includes("On Error") &&
      kb.includes("NoCache") &&
      kb.includes("ENFORCED") // DEFAULT_CONFIG.enforceKbGate === true
  );

  // --- 95: suggested KB queries keep only Notes object-model tokens ---
  const suggested = suggestedKbQueries([
    "NotesSession",
    "NotesDocument",
    "NotesView",
    "NotesItem",
    "zpracovaniDoklady",
    "g_total",
  ]);
  report(
    "95",
    "suggestedKbQueries keeps up to 3 Notes* API tokens and drops domain variables/procedures",
    suggested.includes("kb_search(collection: 'lotus-notes', query: 'NotesSession')") &&
      suggested.includes("'NotesDocument'") &&
      suggested.includes("'NotesView'") &&
      !suggested.includes("NotesItem") && // capped at 3
      !suggested.includes("zpracovaniDoklady") &&
      !suggested.includes("g_total") &&
      suggestedKbQueries(["helper", "g_total"]) === ""
  );

  // --- 96: banner suggestion block is model-facing English (no Czech diacritics) ---
  report(
    "96",
    "suggested KB query block is Czech-free (agent-facing language policy)",
    !/[áčďéěíňóřšťúůýž]/i.test(suggested)
  );
}
