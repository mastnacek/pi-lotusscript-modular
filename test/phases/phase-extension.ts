/**
 * Phase: extension wiring — the composition root registers the whole-file
 * surface (tools, command, every hook) and drains on shutdown. No modular
 * dependency may remain in the wiring.
 */

import lotusscriptModularExtension from "../../index.js";
import fs from "node:fs";
import path from "node:path";
import { ensureTestDir, MOCK_THEME, mockCtx, mockPi, TEST_DIR, writeLss } from "../helpers.js";

export async function phaseExtension(): Promise<void> {
  ensureTestDir();

  const registered: string[] = [];
  const tools: string[] = [];
  const hooks: string[] = [];
  const subs: Array<() => void> = [];
  const handlers: Record<string, any> = {};
  let commandDescription = "";

  const pi: any = {
    on: (evt: string, handler: any) => {
      hooks.push(evt);
      handlers[evt] = handler;
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
    "resources_discover",
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

  // 7. Consent flow: a Domino workspace asks first, consent queues the skill,
  //    and the queued body is injected exactly once at the next run.
  writeLss("Consent.lss");
  const ctxAsk = mockCtx(true, "load");
  await handlers["session_start"]!({ type: "session_start", reason: "startup" }, ctxAsk);
  console.log("7. session_start opens the consent modal in a Domino project:", ctxAsk.modals.length === 1 ? "PASS" : "FAIL");
  if (ctxAsk.modals.length !== 1) throw new Error("no consent modal");

  const injected = await handlers["before_agent_start"]!(
    { systemPromptOptions: { promptGuidelines: [] } } as any,
    ctxAsk
  );
  const injectedText = JSON.stringify(injected ?? {});
  const okInjected = injectedText.includes("lotusscript-skill") && injectedText.includes("ENTRY SKILL LOADED");
  console.log("8. consent injects the entry skill into the first run:", okInjected ? "PASS" : "FAIL");
  if (!okInjected) throw new Error(`No skill message: ${injectedText.slice(0, 200)}`);

  const again = await handlers["before_agent_start"]!(
    { systemPromptOptions: { promptGuidelines: [] } } as any,
    ctxAsk
  );
  console.log("9. the skill is injected exactly once:", again === undefined ? "PASS" : "FAIL");
  if (again !== undefined) throw new Error("skill re-injected");

  // 10. Discovery advertises the skill here — this is the ONLY advertisement
  //     (the package declares no unconditional `skills` entry any more).
  const advertised = await handlers["resources_discover"]!(
    { type: "resources_discover", cwd: TEST_DIR, reason: "startup" },
    ctxAsk
  );
  const advertisedPath = advertised?.skillPaths?.[0] ?? "";
  const okAdvertised = advertisedPath.replace(/\\/g, "/").endsWith("skills/lotusscript-modular/SKILL.md");
  console.log("10. resources_discover advertises the entry skill in a Domino project:", okAdvertised ? "PASS" : "FAIL");
  if (!okAdvertised) throw new Error(`Not advertised: ${JSON.stringify(advertised)}`);

  // 11. "Don't ask in this project" is persisted and silences later sessions.
  await handlers["session_start"]!(
    { type: "session_start", reason: "startup" },
    mockCtx(true, "never")
  );
  const cfgFile = path.join(TEST_DIR, ".pi", "lotusscript-modular.json");
  const persisted = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, "utf-8") : "";
  const okPersist = persisted.includes('"skillPrompt": "never"');
  console.log("11. 'never ask' is stored in the project config:", okPersist ? "PASS" : "FAIL");
  if (!okPersist) throw new Error(`Not persisted: ${persisted.slice(0, 200)}`);

  const ctxSilent = mockCtx(true, "load");
  await handlers["session_start"]!({ type: "session_start", reason: "startup" }, ctxSilent);
  console.log("12. the persisted answer silences the next session:", ctxSilent.modals.length === 0 ? "PASS" : "FAIL");
  if (ctxSilent.modals.length !== 0) throw new Error("asked again after 'never'");

  // 13. The opt-out gates the advertisement too, not just the dialog.
  const afterOptOut = await handlers["resources_discover"]!(
    { type: "resources_discover", cwd: TEST_DIR, reason: "startup" },
    ctxSilent
  );
  console.log("13. the opt-out also stops resource advertising:", afterOptOut?.skillPaths === undefined ? "PASS" : "FAIL");
  if (afterOptOut?.skillPaths !== undefined) throw new Error(`Still advertised: ${JSON.stringify(afterOptOut)}`);

  // 20. The skill checkpoint follows the real answer, not the session start.
  //     Rendered through the HUD component the extension actually installed.
  const hudFor = (root: string) => {
    const ctx: any = mockCtx(true);
    ctx.cwd = root;
    const box: { factory: any } = { factory: null };
    ctx.ui.setWidget = (key: string, factory: any) => {
      if (key === "lotusscript-hud") box.factory = factory;
    };
    const h = mockPi(["session_start", "resources_discover"]);
    lotusscriptModularExtension(h.pi);
    return { ctx, box, h };
  };

  const emptyRoot = path.join(TEST_DIR, "empty-nodomino");
  fs.mkdirSync(emptyRoot, { recursive: true });
  const quiet = hudFor(emptyRoot);
  await quiet.h.handlers.session_start({ reason: "startup" }, quiet.ctx);
  const quietText = quiet.box.factory ? quiet.box.factory(null, MOCK_THEME).render(200).join("\n") : "";
  const okQuietTrace = quietText.length > 0 && !/skill/i.test(quietText);

  // A real Domino workspace advertises the skill, and only then is there a checkpoint.
  // A dedicated root: TEST_DIR carries a persisted "never" from an earlier test.
  const dominoRoot = path.join(TEST_DIR, "domino-proj");
  fs.mkdirSync(dominoRoot, { recursive: true });
  fs.writeFileSync(
    path.join(dominoRoot, "SkillTraceAgent.lss"),
    ["Option Declare", "", "Sub Initialize", "End Sub", ""].join(String.fromCharCode(10))
  );
  const domino = hudFor(dominoRoot);
  await domino.h.handlers.session_start({ reason: "startup" }, domino.ctx);
  const resources = domino.h.handlers.resources_discover?.();
  const dominoText = domino.box.factory ? domino.box.factory(null, MOCK_THEME).render(200).join("\n") : "";
  const okAdvertisedTrace = Boolean(resources?.skillPaths?.length) && /skill/i.test(dominoText);

  console.log(
    "20. skill checkpoint appears only when the skill is really offered:",
    okQuietTrace && okAdvertisedTrace ? "PASS" : "FAIL"
  );
  if (!(okQuietTrace && okAdvertisedTrace)) {
    throw new Error(JSON.stringify({ quietText, dominoText, resources }));
  }
}
