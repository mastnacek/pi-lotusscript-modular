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
  handleAgentBeforeSettle,
  buildPromptGuidelines,
  handleToolCall,
  handleToolResult,
  type SettledDeps,
} from "./src/slices/pipeline/index.js";
import { createLsCommand } from "./src/slices/commands/index.js";
import type { CommandsDeps } from "./src/slices/commands/deps.js";
import { registerModelTools } from "./src/slices/tools/index.js";
import type { ToolsDeps } from "./src/slices/tools/deps.js";
import type { PipelineDeps } from "./src/slices/pipeline/deps.js";
import { guardKbBeforeEdit, guardProtectedFiles } from "./src/slices/guards/index.js";
import { MUTATING_TOOL_NAMES } from "./src/slices/pipeline/mutating-tools.js";
import {
  buildGradingRubric,
  buildRecurringGotchaDraft,
  findRecurringSignatures,
  normalizeDiagnostics,
} from "./src/slices/scorecard/index.js";
import { stringsFor } from "./src/shared/i18n.js";
import {
  completeLsArguments,
  findSetting,
  formatValue,
  parseValue,
  settingCopy,
} from "./src/slices/settings/index.js";
import {
  addGotcha,
  getEffectiveGotchasPath,
  getGotchasSummary,
  promptGotchaReview,
  searchGotchas,
} from "./src/slices/gotchas/index.js";
import { AgentParser } from "./src/slices/parser/index.js";
import {
  checkLotusScriptDiagnostics,
  explainLotusScriptCodes,
  formatLotusScriptFile,
} from "./src/slices/lsp/index.js";
import { lintModularFolder } from "./src/slices/linter/index.js";
import { formatScorecard, trendLabel } from "./src/slices/scorecard/index.js";
import { scaffoldLotusScriptArtifact } from "./src/slices/scaffold/index.js";

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  // Subagent recursion guard (pi-plugin-dev §8): child sessions load all
  // global extensions; hooks, guards and the telemetry panel must not fire there.
  if (process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION)) {
    return;
  }

  const state = createPluginState();
  const { track } = state;

  // Composition-root wiring: the commands slice never imports sibling slices —
  // every cross-slice capability arrives through this deps object (VSA §6).
  const commandsDeps: CommandsDeps = {
    completeLsArguments,
    findSetting,
    formatValue,
    parseValue,
    settingCopy,
    getEffectiveGotchasPath,
    getGotchasSummary,
    searchGotchas,
    addGotcha,
    promptGotchaReview,
    compileAgent: (target, options) => AgentParser.compileAgent(target, options),
    checkLotusScriptDiagnostics,
    lintModularFolder,
    formatScorecard,
    scaffoldLotusScriptArtifact,
  };

  const settledDeps: SettledDeps = {
    compileAgent: (target, options) => AgentParser.compileAgent(target, options),
    checkLotusScriptDiagnostics,
    trendLabel,
  };

  // Pipeline slice wiring: tool_call / tool_result / guideline handlers reach
  // parser / guards / lsp / scorecard / gotchas only through this seam (VSA §6).
  const pipelineDeps: PipelineDeps = {
    compileAgent: (target, options) => AgentParser.compileAgent(target, options),
    guardProtectedFiles,
    guardKbBeforeEdit,
    mutatingToolNames: MUTATING_TOOL_NAMES,
    checkLotusScriptDiagnostics,
    explainLotusScriptCodes,
    formatLotusScriptFile,
    formatScorecard,
    buildGradingRubric,
    trendLabel,
    normalizeDiagnostics,
    findRecurringSignatures,
    buildRecurringGotchaDraft,
    addGotcha,
    promptGotchaReview,
  };

  // Model-tools slice wiring (parser / lsp / gotchas / scaffold + i18n copy).
  const toolsDeps: ToolsDeps = {
    compileAgent: (target, options) => AgentParser.compileAgent(target, options),
    checkLotusScriptDiagnostics,
    explainLotusScriptCodes,
    searchGotchas,
    getGotchasSummary,
    addGotcha,
    promptGotchaReview,
    scaffoldLotusScriptArtifact,
    strings: stringsFor,
  };

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
      await handleAgentSettled(state, ctx, settledDeps);
    } finally {
      state.countHook("agent_settled");
    }
  }));

  // Verify-before-done: one KB verification turn when a run mutated
  // .lss/.dxl sources without any kb_search (see slices/pipeline/before-settle).
  track(pi.on("agent_before_settle", () => {
    state.countHook("agent_before_settle");
    return handleAgentBeforeSettle(state);
  }));

  // Prompt injection: debrief handoff + enforce KB query + inject gotchas reminder
  track(pi.on("before_agent_start", async (event, _ctx: ExtensionContext) => {
    state.countHook("before_agent_start");
    state.beginRun(); // per-run flags: KB consult / mutation / settle nudge
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

    event.systemPromptOptions.promptGuidelines.push(...buildPromptGuidelines(state.config, pipelineDeps));

    return debriefMessage;
  }));

  // 1. Tool Call Interception (protected-file guard + KB edit gate)
  track(pi.on("tool_call", (event) => {
    const result = handleToolCall(state, event, pipelineDeps);
    state.countHook("tool_call");
    return result;
  }));

  // 2. Tool Result Interception (Context injection on Read/Inspect, Auto-recompile on Edit/Write)
  track(pi.on("tool_result", async (event, ctx: ExtensionContext) => {
    const result = await handleToolResult(state, event, ctx, pipelineDeps);
    state.countHook("tool_result");
    return result;
  }));

  // 3. Unified `/ls` Command with Lazy Menus
  pi.registerCommand("ls", createLsCommand(state, commandsDeps));

  // 4. Custom Tools for the Model
  registerModelTools(pi, state, toolsDeps);

  track(pi.on("session_shutdown", () => {
    while (state.unsubscribers.length > 0) state.unsubscribers.pop()?.();
  }));
}
