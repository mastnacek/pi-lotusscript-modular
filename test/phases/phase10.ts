/**
 * Phase 10 (tests 44–47): recurring-failure gotcha drafting — normalization,
 * recurrence detection, draft builder, integration modal-once test.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildRecurringGotchaDraft,
  findRecurringSignatures,
  normalizeDiagnostics,
} from "../../src/slices/scorecard/index.js";
import { projectConfigPath } from "../../src/shared/config.js";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, makeRoot, mockPi } from "../helpers.js";

export async function phase10(): Promise<void> {
  // 44. normalizeDiagnostics is location-independent
  const sigA = normalizeDiagnostics("ERROR: Type mismatch in assignment (line 10; column 2)")[0];
  const sigB = normalizeDiagnostics("ERROR: Type mismatch in assignment (line 931; column 37)")[0];
  const normOk =
    !!sigA &&
    sigA === sigB &&
    sigA.includes("type mismatch") &&
    !/\d/.test(sigA);
  console.log("44. normalizeDiagnostics strips line/column so the same fault matches:", normOk ? "PASS" : "FAIL");
  if (!normOk) throw new Error(`Normalization failed: "${sigA}" vs "${sigB}"`);

  // 45. findRecurringSignatures distinguishes recurring from one-off
  const recurringHit = findRecurringSignatures(["error: type mismatch in assignment"], [["error: type mismatch in assignment"]], 2);
  const oneOff = findRecurringSignatures(["error: brand new problem here"], [["error: type mismatch in assignment"]], 2);
  const noHistory = findRecurringSignatures(["error: type mismatch in assignment"], [], 2);
  const recurOk = recurringHit.length === 1 && oneOff.length === 0 && noHistory.length === 0;
  console.log("45. findRecurringSignatures flags only genuine repeats:", recurOk ? "PASS" : "FAIL");
  if (!recurOk) throw new Error(`Recurrence detection failed: ${JSON.stringify({ recurringHit, oneOff, noHistory })}`);

  // 46. buildRecurringGotchaDraft produces a usable draft
  const draft = buildRecurringGotchaDraft("RecurAgent", ["error: type mismatch in assignment"], ["sub_Recur.lss"]);
  const draftOk =
    draft.title.includes("Recurring LotusScript diagnostic in RecurAgent") &&
    draft.body.includes("Recurring failure detected by the harness") &&
    draft.body.includes("sub_Recur.lss") &&
    draft.body.includes("error: type mismatch in assignment");
  console.log("46. buildRecurringGotchaDraft produces a usable draft:", draftOk ? "PASS" : "FAIL");
  if (!draftOk) throw new Error(`Bad draft: ${JSON.stringify(draft)}`);

  // 47. Integration: a recurring LSP diagnostic opens the gotcha modal exactly once
  const fakeLsp = path.join(TEST_DIR, "fake-lsp.cjs");
  fs.writeFileSync(
    fakeLsp,
    [
      "process.stdin.setEncoding('utf8');",
      "let buf = '';",
      "process.stdin.on('data', (chunk) => {",
      "  buf += chunk;",
      "  let idx;",
      "  while ((idx = buf.indexOf('\\n')) !== -1) {",
      "    const line = buf.slice(0, idx).trim();",
      "    buf = buf.slice(idx + 1);",
      "    if (!line) continue;",
      "    let msg;",
      "    try { msg = JSON.parse(line); } catch { continue; }",
      "    if (msg.method === 'initialize') {",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');",
      "    } else if (msg.method === 'tools/call') {",
      "      const n = 100 + Math.floor(Math.random() * 800);",
      "      const text = `ERROR: Type mismatch in assignment (line ${n}; column ${n % 40})`;",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text }] } }) + '\\n');",
      "    }",
      "  }",
      "});",
    ].join("\n"),
    "utf-8"
  );

  const recurDir = makeRoot("RecurAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_x As Long\n",
    "sub_Recur.lss": "' @script-member-of: RecurAgent\n' @procedure: Recur\n' Účel: Procedura pro test opakované LSP chyby.\nSub Recur()\n    Print \"r\"\nEnd Sub\n",
  });

  const cfgPath = projectConfigPath(TEST_DIR);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ enableLsp: true, autoDraftRecurringGotchas: true }, null, 2),
    "utf-8"
  );

  const previousLspEnv = process.env.LOTUSSCRIPT_MCP_SERVER;
  process.env.LOTUSSCRIPT_MCP_SERVER = fakeLsp;

  let modalCalls = 0;
  const recurCtx: any = {
    hasUI: true,
    cwd: TEST_DIR,
    ui: {
      custom: async () => {
        modalCalls++;
        return { action: "cancel" };
      },
      notify: () => {},
    },
  };

  const { pi: recurPi, handlers: recurHandlers } = mockPi(["session_start", "tool_result"]);
  lotusscriptModularExtension(recurPi);
  recurHandlers["session_start"]({}, recurCtx);

  const recurEdit = () => ({
    toolName: "edit",
    input: { path: path.join(recurDir, "sub_Recur.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });

  await recurHandlers["tool_result"](recurEdit(), recurCtx);
  const afterFirst = modalCalls;
  await recurHandlers["tool_result"](recurEdit(), recurCtx);
  const afterSecond = modalCalls;
  await recurHandlers["tool_result"](recurEdit(), recurCtx);
  const afterThird = modalCalls;

  const recurringOk = afterFirst === 0 && afterSecond === 1 && afterThird === 1;
  console.log("47. Recurring LSP diagnostic drafts a gotcha exactly once:", recurringOk ? "PASS" : "FAIL");
  if (!recurringOk) {
    throw new Error(`Recurring detection failed — modal calls after each cycle: ${afterFirst}/${afterSecond}/${afterThird}`);
  }

  if (previousLspEnv === undefined) delete process.env.LOTUSSCRIPT_MCP_SERVER;
  else process.env.LOTUSSCRIPT_MCP_SERVER = previousLspEnv;
}
