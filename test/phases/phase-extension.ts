/**
 * Phase: extension wiring — the composition root registers the whole-file
 * surface (tools, command, every hook) and drains on shutdown. No modular
 * dependency may remain in the wiring.
 */

import lotusscriptModularExtension from "../../index.js";
import { ensureTestDir, mockCtx } from "../helpers.js";

export async function phaseExtension(): Promise<void> {
  ensureTestDir();

  const registered: string[] = [];
  const tools: string[] = [];
  const hooks: string[] = [];
  const subs: Array<() => void> = [];
  let commandDescription = "";

  const pi: any = {
    on: (evt: string, handler: any) => {
      hooks.push(evt);
      const unsub = () => {
        const i = subs.indexOf(unsub);
        if (i >= 0) subs.splice(i, 1);
      };
      subs.push(unsub);
      return unsub;
    },
    registerCommand: (name: string, def: any) => {
      registered.push(name);
      commandDescription = def?.description ?? "";
    },
    registerTool: (def: any) => tools.push(def.name),
  };

  lotusscriptModularExtension(pi);

  // 1. The three model tools, and only the whole-file check tool.
  const okTools =
    tools.includes("lotusscript_check") &&
    tools.includes("lotusscript_scaffold") &&
    tools.includes("lotusscript_gotchas") &&
    !tools.includes("lotusscript_compile");
  console.log("1. tools registered (check/scaffold/gotchas, no compile):", okTools ? "PASS" : "FAIL");
  if (!okTools) throw new Error(`Tools: ${JSON.stringify(tools)}`);

  // 2. The /ls command is registered with a whole-file description.
  const okCmd = registered.includes("ls") && !/modular LotusScript agents/i.test(commandDescription);
  console.log("2. /ls command registered with a whole-file description:", okCmd ? "PASS" : "FAIL");
  if (!okCmd) throw new Error(`Command: ${commandDescription}`);

  // 3. Every hook the pipeline needs is subscribed.
  const expected = [
    "session_start",
    "turn_end",
    "agent_settled",
    "agent_before_settle",
    "before_agent_start",
    "tool_call",
    "tool_result",
  ];
  const missing = expected.filter((h) => !hooks.includes(h));
  console.log(`3. all pipeline hooks subscribed (missing: ${missing.join(",") || "none"}):`, missing.length === 0 ? "PASS" : "FAIL");
  if (missing.length > 0) throw new Error(`Missing hooks: ${JSON.stringify(missing)}`);

  // 4. session_shutdown drains every subscription (idempotent).
  const before = subs.length;
  const shutdownIndex = hooks.lastIndexOf("session_shutdown");
  const okShutdownHook = shutdownIndex >= 0 && shutdownIndex === hooks.length - 1;
  console.log("4. session_shutdown subscribed last:", okShutdownHook ? "PASS" : "FAIL");
  if (!okShutdownHook) throw new Error("no trailing session_shutdown hook");
  // Every hook plus session_shutdown itself is retained for the drain.
  const okSubs = before === expected.length + 1;
  console.log(`5. ${before} subscriptions retained for draining (hooks + shutdown):`, okSubs ? "PASS" : "FAIL");
  if (!okSubs) throw new Error(`Expected ${expected.length + 1} subscriptions, got ${before}`);

  // 6. Driving before_agent_start injects the guidelines (whole-file rules).
  const guidelineHandlers: any[] = [];
  const pi2: any = {
    on: (evt: string, handler: any) => {
      if (evt === "before_agent_start") guidelineHandlers.push(handler);
      return () => {};
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(pi2);
  const ctx = mockCtx(true);
  const sessionStart = guidelineHandlers[0];
  const event = { systemPromptOptions: { promptGuidelines: [] as string[] } };
  await sessionStart(event, ctx);
  const joined = event.systemPromptOptions.promptGuidelines.join("\n");
  const okGuidelines =
    joined.includes("DEFINITION OF DONE") &&
    joined.includes("Never create a modular folder") &&
    joined.includes("lotusscript_check");
  console.log("6. injected guidelines describe the whole-file workflow:", okGuidelines ? "PASS" : "FAIL");
  if (!okGuidelines) throw new Error(`Guidelines:\n${joined.slice(0, 600)}`);
}
