/**
 * pi-lotusscript-modular — composition root.
 *
 * Composition root ONLY: creates the PluginState kernel and wires slices onto
 * Pi events. No business logic lives here:
 * - guard rules               → src/slices/guards
 * - tool_call/tool_result/settled translation → src/slices/pipeline
 * - /ls command               → src/slices/commands
 * - model tools               → src/slices/tools
 * - parsing logic             → src/slices/parser
 * - LSP logic                 → src/slices/lsp
 * - gotchas                   → src/slices/gotchas
 * - settings and completions  → src/slices/settings
 * - scaffolding + naming      → src/slices/scaffold
 * - session state + helpers   → src/shared/state
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createPluginState } from "./src/shared/state.js";
import {
  handleAgentSettled,
  buildPromptGuidelines,
  handleToolCall,
  handleToolResult,
} from "./src/slices/pipeline/index.js";
import { createLsCommand } from "./src/slices/commands/index.js";
import { routeRequest } from "./src/slices/routing/index.js";
import { registerModelTools } from "./src/slices/tools/index.js";

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  // Subagent recursion guard (pi-plugin-dev §8): child sessions load all
  // global extensions; hooks, guards and the telemetry panel must not fire there.
  if (process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION)) {
    return;
  }

  const state = createPluginState();
  const { track } = state;

  track(pi.on("session_start", (_event, ctx: ExtensionContext) => {
    state.latestUiContext = ctx;
    state.syncConfig(ctx.cwd);
    state.countHook("session_start"); // also renders the telemetry panel
    state.renderStatusline("idle");
  }));

  track(pi.on("turn_end", () => {
    state.countHook("turn_end");
    state.renderStatusline("idle");
  }));

  track(pi.on("agent_settled", async (_event, ctx: ExtensionContext) => {
    try {
      await handleAgentSettled(state, ctx);
    } finally {
      state.countHook("agent_settled");
    }
  }));

  // Prompt injection: debrief handoff + enforce KB query + inject gotchas reminder
  track(pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    state.countHook("before_agent_start");
    const pendingDebrief = state.pendingDebriefs.length > 0 ? state.pendingDebriefs.join("\n\n") : "";
    if (pendingDebrief) state.pendingDebriefs.length = 0;
    const debriefMessage = pendingDebrief
      ? {
          message: {
            customType: "lotusscript-debrief",
            content: pendingDebrief,
            display: true,
          },
        }
      : undefined;

    if (!event.systemPromptOptions?.promptGuidelines) return debriefMessage;

    event.systemPromptOptions.promptGuidelines.push(...buildPromptGuidelines(state.config));

    // Optional Jev routing gate. Tier 0 is free and runs first; the model is
    // only consulted when no deterministic signal fired. Fails open.
    const verdict = await routeRequest(event.prompt, state.config, ctx);
    state.telemetry.routeChecks++;
    state.telemetry.routeHits += verdict.guideline ? 1 : 0;
    if (verdict.guideline) {
      event.systemPromptOptions.promptGuidelines.push(verdict.guideline);
    }

    return debriefMessage;
  }));

  // 1. Tool Call Interception (Auto-decompile on Read/Inspect or redirect to existing modular dir)
  track(pi.on("tool_call", (event) => {
    const result = handleToolCall(state, event);
    state.countHook("tool_call");
    return result;
  }));

  // 2. Tool Result Interception (Context injection on Read/Inspect, Auto-recompile on Edit/Write)
  track(pi.on("tool_result", async (event, ctx: ExtensionContext) => {
    const result = await handleToolResult(state, event, ctx);
    state.countHook("tool_result");
    return result;
  }));

  // 3. Unified `/ls` Command with Lazy Menus
  pi.registerCommand("ls", createLsCommand(state));

  // 4. Custom Tools for the Model
  registerModelTools(pi, state);

  track(pi.on("session_shutdown", () => {
    while (state.unsubscribers.length > 0) state.unsubscribers.pop()?.();
  }));
}
