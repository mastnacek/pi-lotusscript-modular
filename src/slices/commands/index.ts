/**
 * Unified `/ls` command with lazy menus. This module is pure dispatch: the
 * subcommand handlers live in sibling files (ls-config, ls-inspect,
 * ls-compile, ls-gotchas) so each stays under the per-file line limit.
 * Cross-slice capabilities arrive via CommandsDeps, wired by the composition
 * root (slice isolation, VSA).
 */

import type {
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import {
  lsConfig,
  lsDirectSetting,
  lsHelp,
  lsLang,
  lsLsp,
  lsStatus,
  type LsParts,
} from "./ls-config.js";
import { lsScaffold, lsScore } from "./ls-inspect.js";
import { lsCheck } from "./ls-check.js";
import { lsGotchas } from "./ls-gotchas.js";

export interface RegisteredLsCommand {
  description: string;
  getArgumentCompletions: (prefix: string) => ReturnType<CommandsDeps["completeLsArguments"]>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

type LsSubHandler = (state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps) => Promise<void>;

const SUBCOMMANDS: Record<string, LsSubHandler> = {
  status: lsStatus,
  config: lsConfig,
  scaffold: lsScaffold,
  score: lsScore,
  check: lsCheck,
  gotchas: lsGotchas,
};

export function createLsCommand(state: PluginState, deps: CommandsDeps): RegisteredLsCommand {
  async function handler(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const rawTokens: LsParts = (args || "").trim().split(/\s+/).filter(Boolean);
    // The --global flag is parsed here (config cascade: global → ~/.pi/agent/,
    // else project <cwd>/.pi/) and passed to every mutating handler.
    const isGlobal = rawTokens.some((t) => t.toLowerCase() === "--global");
    const parts = rawTokens.filter((t) => t.toLowerCase() !== "--global");
    const sub = (parts[0] || "help").toLowerCase();

    if (sub === "lsp") {
      await lsLsp(state, parts, ctx, deps, isGlobal);
      return;
    }
    if (sub === "lang") {
      await lsLang(state, parts, ctx, deps, isGlobal);
      return;
    }
    if (sub === "config") {
      await lsConfig(state, parts, ctx, deps, isGlobal);
      return;
    }

    const subHandler = SUBCOMMANDS[sub];
    if (subHandler) {
      await subHandler(state, parts, ctx, deps);
      return;
    }

    // Direct setting access: /ls <setting> [value]
    const directSpec = deps.findSetting(sub);
    if (directSpec) {
      await lsDirectSetting(state, sub, parts[1], ctx, deps, isGlobal);
      return;
    }

    await lsHelp(state, parts, ctx, deps);
  }

  return {
    // Registration-time locale: the config file is only loaded at
    // session_start, so a persisted `lang` applies to this description after
    // the next session (command metadata is fixed at registration).
    description: stringsFor(state.config.lang).cmdDescription,
    getArgumentCompletions: (prefix: string) => {
      // Read the live config per call — updateConfig() replaces the object.
      return deps.completeLsArguments(prefix, state.config);
    },
    handler,
  };
}

export type { AgentScorecard } from "../../shared/types.js";
