/**
 * Phase 9 (tests 40–43): pre-flight gotcha banners + debrief handoff.
 */

import fs from "node:fs";
import path from "node:path";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, makeRoot, mockPi } from "../helpers.js";

export async function phase9(): Promise<void> {
  // 40. Pre-flight banner surfaces a trap matching the agent's own identifier
  const preflightDir = makeRoot("PreflightAgent", {
    "00_options.lss": "Option Public\nOption Declare\n",
    "01_declarations.lss": "' Deklarace\nDim shell As Variant\n",
    "sub_Thing.lss": "' @script-member-of: PreflightAgent\n' @procedure: Thing\n' Účel: Testovací procedura pro předletovou kontrolu gotchas.\nSub Thing()\n    Print \"x\"\nEnd Sub\n",
  });

  const { pi: preflightPi, handlers: preflightHandlers } = mockPi(["tool_result"]);
  lotusscriptModularExtension(preflightPi);

  const preflightRead = await preflightHandlers["tool_result"]({
    toolName: "read",
    input: { path: path.join(preflightDir, "main.lss") },
    content: [{ type: "text", text: "main.lss body" }],
    isError: false,
  });
  const preflightText: string = preflightRead?.content?.[1]?.text ?? "";
  const preflightOk =
    preflightText.includes("PRE-FLIGHT GOTCHA CHECK") &&
    preflightText.toLowerCase().includes("shell");
  console.log("40. Pre-flight banner surfaces traps matching agent identifiers:", preflightOk ? "PASS" : "FAIL");
  if (!preflightOk) throw new Error(`Pre-flight banner missing targeted match:\n${preflightText}`);

  // 41. Pre-flight falls back to the generic summary when nothing matches
  const inertDir = makeRoot("InertAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\n",
    "sub_Zzq.lss": "' @script-member-of: InertAgent\n' @procedure: Zzq\n' Účel: Inertní procedura bez kolize s evidovanými pastmi.\nSub Zzq()\n    Print \"y\"\nEnd Sub\n",
  });
  const inertRead = await preflightHandlers["tool_result"]({
    toolName: "read",
    input: { path: path.join(inertDir, "main.lss") },
    content: [{ type: "text", text: "main.lss body" }],
    isError: false,
  });
  const inertText: string = inertRead?.content?.[1]?.text ?? "";
  const fallbackOk = inertText.includes("Top Critical LotusScript Gotchas");
  console.log("41. Pre-flight falls back to generic summary without matches:", fallbackOk ? "PASS" : "FAIL");
  if (!fallbackOk) throw new Error(`Expected generic gotchas fallback:\n${inertText}`);

  // 42. Debrief is emitted at settle and handed to the next turn
  const debriefDir = makeRoot("DebriefAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_count As Long\n",
    "sub_NoComment.lss": "' @script-member-of: DebriefAgent\n' @procedure: NoComment\nSub NoComment()\n    Print \"z\"\nEnd Sub\n",
  });

  const { pi: debriefPi, handlers: debriefHandlers } = mockPi(["tool_result", "agent_settled", "before_agent_start"]);
  lotusscriptModularExtension(debriefPi);
  const debriefToolResult = debriefHandlers["tool_result"];
  const debriefSettled = debriefHandlers["agent_settled"];
  const debriefBeforeStart = debriefHandlers["before_agent_start"];

  await debriefToolResult({
    toolName: "edit",
    input: { path: path.join(debriefDir, "sub_NoComment.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });

  const settleCtx: any = { hasUI: false, cwd: TEST_DIR, ui: { notify: () => {} } };
  await debriefSettled({}, settleCtx);

  const debriefEvent: any = { systemPromptOptions: { promptGuidelines: [] } };
  const debriefTurn = debriefBeforeStart(debriefEvent);
  const debriefContent: string = debriefTurn?.message?.content ?? "";
  const debriefOk =
    debriefTurn?.message?.customType === "lotusscript-debrief" &&
    debriefContent.includes("LotusScript Debrief") &&
    debriefContent.includes("Unmet Definition of Done") &&
    debriefContent.includes("Czech purpose comments");
  console.log("42. Debrief emitted at settle and injected into the next turn:", debriefOk ? "PASS" : "FAIL");
  if (!debriefOk) throw new Error(`Debrief handoff failed: ${JSON.stringify(debriefTurn)}`);

  // 42b. Debrief is consumed exactly once
  const secondTurn: any = debriefBeforeStart({ systemPromptOptions: { promptGuidelines: [] } });
  const consumed = secondTurn === undefined;
  console.log("42b. Debrief is consumed once (no repeat injection):", consumed ? "PASS" : "FAIL");
  if (!consumed) throw new Error(`Debrief repeated: ${JSON.stringify(secondTurn)}`);

  // 43. No debrief when the Definition of Done is fully satisfied
  const cleanDir = makeRoot("CleanAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_total As Long\n",
    "sub_Fine.lss": "' @script-member-of: CleanAgent\n' @procedure: Fine\n' Účel: Procedura splňující všechny položky Definition of Done.\nSub Fine()\n    Print \"ok\"\n    ' druhá řádka popisu\nEnd Sub\n",
  });

  const { pi: cleanPi, handlers: cleanHandlers } = mockPi(["tool_result", "agent_settled", "before_agent_start"]);
  lotusscriptModularExtension(cleanPi);

  await cleanHandlers["tool_result"]({
    toolName: "edit",
    input: { path: path.join(cleanDir, "sub_Fine.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });
  await cleanHandlers["agent_settled"]({}, { hasUI: false, cwd: TEST_DIR, ui: { notify: () => {} } });
  const cleanTurn: any = cleanHandlers["before_agent_start"]({ systemPromptOptions: { promptGuidelines: [] } });
  const noDebrief = cleanTurn === undefined;
  console.log("43. No debrief when Definition of Done is satisfied:", noDebrief ? "PASS" : "FAIL");
  if (!noDebrief) throw new Error(`Unexpected debrief for clean agent: ${JSON.stringify(cleanTurn)}`);
}
