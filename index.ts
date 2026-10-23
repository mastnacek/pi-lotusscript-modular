/**
 * pi-lotusscript-modular — composition root.
 *
 * Composition root ONLY: creates the PluginState kernel and wires slices onto
 * Pi events. No business logic lives here:
 * - guard rules               → src/slices/guards
 * - tool_call/tool_result/settled translation → src/slices/pipeline
 * - /ls command               → src/slices/commands
 * - model tools               → src/slices/tools
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
import { guardKbBeforeEdit } from "./src/slices/guards/index.js";
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
import {
  checkLotusScriptDiagnostics,
  explainLotusScriptCodes,
  formatLotusScriptFile,
} from "./src/slices/lsp/index.js";
import { formatScorecard, trendLabel } from "./src/slices/scorecard/index.js";
import { scaffoldLotusScriptArtifact } from "./src/slices/scaffold/index.js";
import { checkVersioning, observeVersionHeader } from "./src/slices/versioning/index.js";
import { checkDrift } from "./src/slices/drift/index.js";
import { emitTrace, type TraceEvent } from "./src/slices/trace/index.js";
import { auditForCommand, auditForTool } from "./src/slices/audit/index.js";
import {
  buildProjectSkillGuideline,
  buildReadSkillNotice,
  createProjectDetector,
  getEntrySkillPath,
  hasEntrySkill,
  promptSkillConsent,
  readEntrySkillBody,
  skillChoiceOutcome,
  skillPromptDecision,
  wrapSkillMessage,
} from "./src/slices/project/index.js";

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  // Subagent recursion guard (pi-plugin-dev §8): child sessions load all
  // global extensions; hooks, guards and the telemetry panel must not fire there.
  if (process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION)) {
    return;
  }

  const state = createPluginState();
  const { track } = state;

  // One bounded project scan per session root, memoized by the slice; the
  // pipeline only ever sees the finished hint, never the scan itself.
  const projectDetector = createProjectDetector();

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
    checkLotusScriptDiagnostics,
    formatScorecard,
    scaffoldLotusScriptArtifact,
    auditLibraries: (dir, lang) => auditForCommand(dir, lang),
  };

  // Visible skill trace: user-facing only (ui.notify), never model context.
  const traceSink = {
    notify: (text: string) => state.latestUiContext?.ui?.notify?.(text, "info"),
  };
  const trace = (event: TraceEvent) => emitTrace(state, traceSink, event);

  const settledDeps: SettledDeps = {
    checkLotusScriptDiagnostics,
    trendLabel,
  };

  // Pipeline slice wiring: tool_call / tool_result / guideline handlers reach
  // parser / guards / lsp / scorecard / gotchas only through this seam (VSA §6).
  const pipelineDeps: PipelineDeps = {
    guardKbBeforeEdit,
    mutatingToolNames: MUTATING_TOOL_NAMES,
    trace: (event) => trace(event as TraceEvent),
    observeVersionHeader: (filePath) => observeVersionHeader(state, filePath),
    checkVersioning: (filePath) => checkVersioning(state, filePath),
    checkDrift: (filePath) => checkDrift(state, filePath),
    projectSkillGuideline: () =>
      state.skillLoadedThisSession
        ? null // the body was already injected — a second pointer is noise
        : buildProjectSkillGuideline(projectDetector.detect(state.activeCwd), getEntrySkillPath()),
    readSkillNotice: () => (hasEntrySkill() ? buildReadSkillNotice(getEntrySkillPath()) : null),
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

  // Model-tools slice wiring (lsp / gotchas / scaffold + i18n copy).
  const toolsDeps: ToolsDeps = {
    checkLotusScriptDiagnostics,
    explainLotusScriptCodes,
    searchGotchas,
    getGotchasSummary,
    addGotcha,
    promptGotchaReview,
    scaffoldLotusScriptArtifact,
    auditLibraries: (dir, lang, plan) => auditForTool(dir, lang, plan),
    strings: stringsFor,
  };

  /** Queue the entry skill for the next run and tell the operator what happened. */
  const loadEntrySkill = (ctx: ExtensionContext): void => {
    const strings = stringsFor(state.config.lang);
    const skillPath = getEntrySkillPath();
    const body = readEntrySkillBody();
    if (!body) {
      ctx.ui?.notify?.(strings.skillModal.missing, "warning");
      return;
    }
    state.pendingSkillLoad = wrapSkillMessage(body, skillPath);
    state.skillLoadedThisSession = true;
    ctx.ui?.notify?.(strings.skillModal.loaded(skillPath), "info");
  };

  track(pi.on("session_start", async (event, ctx: ExtensionContext) => {
    state.latestUiContext = ctx;
    state.syncConfig(ctx.cwd); // sets activeCwd — the detector keys off it
    projectDetector.reset(); // new session, new root: fingerprint is stale
    state.countHook("session_start"); // also renders the telemetry panel
    state.renderStatusline("idle");
    trace({ kind: "skill", detail: "lotusscript-modular" });

    // Entry-skill consent: the operator decides per project (like the shell
    // profile asking about a uv venv), and "never" is remembered in the
    // project config instead of being re-asked every session.
    const fingerprint = projectDetector.detect(state.activeCwd);
    const decision = skillPromptDecision(fingerprint, state.config);
    const strings = stringsFor(state.config.lang);

    if (decision === "load") {
      loadEntrySkill(ctx);
      return;
    }
    if (decision !== "ask") return;
    // Ask only when the operator actually starts something (startup / new);
    // a reload, resume or fork must not re-open the dialog.
    if (event.reason !== "startup" && event.reason !== "new") return;

    const choice = await promptSkillConsent(ctx, strings, fingerprint);
    if (!choice) return; // non-TUI or dismissed: no consent, nothing loaded

    const outcome = skillChoiceOutcome(choice);
    if (outcome.persist) {
      state.updateConfig({ ...state.config, skillPrompt: outcome.persist }, false, ctx.cwd);
      ctx.ui?.notify?.(strings.skillModal.remembered, "info");
    }
    if (outcome.load) {
      loadEntrySkill(ctx);
    } else if (!outcome.persist) {
      ctx.ui?.notify?.(strings.skillModal.skipped, "info");
    }
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
    // Operator-consented entry skill: injected once, at the first run.
    const pendingSkill = state.pendingSkillLoad;
    state.pendingSkillLoad = null;

    const parts: string[] = [];
    if (pendingSkill) parts.push(pendingSkill);
    if (pendingDebrief) parts.push(pendingDebrief);
    const contextMessage = parts.length
      ? {
          message: {
            customType: pendingSkill ? "lotusscript-skill" : "lotusscript-debrief",
            content: parts.join("\n\n"),
            display: true,
          },
        }
      : undefined;

    if (!event.systemPromptOptions?.promptGuidelines) return contextMessage;

    event.systemPromptOptions.promptGuidelines.push(...buildPromptGuidelines(state.config, pipelineDeps));

    return contextMessage;
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
