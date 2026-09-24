/**
 * Unified `/ls` command with lazy menus. This module is pure dispatch: the
 * subcommand handlers live in sibling files (ls-config, ls-inspect,
 * ls-compile, ls-gotchas) so each stays under the per-file line limit.
 */

import type {
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { completeLsArguments, findSetting } from "../settings/index.js";
import type { PluginState } from "../../shared/state.js";
import {
  lsConfig,
  lsDirectSetting,
  lsHelp,
  lsLsp,
  lsOverwrite,
  lsStatus,
  type LsParts,
} from "./ls-config.js";
import { lsJev, lsLint, lsScaffold, lsScore } from "./ls-inspect.js";
import { lsCompile, lsDecompile, lsPack } from "./ls-compile.js";
import { lsGotchas } from "./ls-gotchas.js";

export interface RegisteredLsCommand {
  description: string;
  getArgumentCompletions: (prefix: string) => ReturnType<typeof completeLsArguments>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

type LsSubHandler = (state: PluginState, parts: LsParts, ctx: ExtensionCommandContext) => Promise<void>;

const SUBCOMMANDS: Record<string, LsSubHandler> = {
  status: lsStatus,
  lsp: lsLsp,
  overwrite: lsOverwrite,
  config: lsConfig,
  scaffold: lsScaffold,
  lint: lsLint,
  score: lsScore,
  jev: lsJev,
  compile: lsCompile,
  pack: lsPack,
  clean: lsPack,
  decompile: lsDecompile,
  gotchas: lsGotchas,
};

export function createLsCommand(state: PluginState): RegisteredLsCommand {
  const { config } = state;

  async function handler(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const rawTokens: LsParts = (args || "").trim().split(/\s+/).filter(Boolean);
    const isGlobal = rawTokens.some((t) => t.toLowerCase() === "--global");
    const parts = rawTokens.filter((t) => t.toLowerCase() !== "--global");
    const sub = (parts[0] || "help").toLowerCase();

    if (sub === "lsp") {
      await lsLsp(state, parts, ctx, isGlobal);
      return;
    }
    if (sub === "overwrite") {
      await lsOverwrite(state, parts, ctx, isGlobal);
      return;
    }
    if (sub === "config") {
      await lsConfig(state, parts, ctx, isGlobal);
      return;
    }

    const subHandler = SUBCOMMANDS[sub];
    if (subHandler) {
      await subHandler(state, parts, ctx);
      return;
    }

    // Direct setting access: /ls <setting> [value]
    const directSpec = findSetting(sub);
    if (directSpec) {
      await lsDirectSetting(state, sub, parts[1], ctx, isGlobal);
      return;
    }

    await lsHelp(state, parts, ctx);
  }

  return {
    description: "Správa modulárních LotusScript agentů, LSP a Gotchas báze",
    getArgumentCompletions: (prefix: string) => {
      return completeLsArguments(prefix, config);
    },
    handler,
  };
}

export type { AgentScorecard } from "../../shared/types.js";
