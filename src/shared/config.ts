import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ModularConfig } from "./types.js";

export const DEFAULT_CONFIG: ModularConfig = {
  enableLsp: false,
  autoDecompileOnRead: true,
  autoRecompileOnSave: true,
  keepTimestampInCompiledName: false,
  overwriteSourceLss: true,
  cleanupOnSettled: true,
  enforceKbPrompt: true,
  enforceKbGate: true,
  injectGotchasSummary: true,
  enforceGotchaCapture: true,
  checkProcedureLimits: true,
  maxProcedureLines: 300,
  enforceCzechComments: true,
  enableScorecard: true,
  enforceGradingRubric: true,
  injectPreflightGotchas: true,
  autoDraftRecurringGotchas: true,
  useJevEvaluation: false,
  jevModel: "typesafe/jev-1.13",
};

export const GLOBAL_CONFIG_FILE = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "lotusscript-modular.json",
);

export function projectConfigPath(cwd?: string): string {
  return path.join(cwd || process.cwd(), CONFIG_DIR_NAME, "lotusscript-modular.json");
}

export function loadConfig(cwd?: string): ModularConfig {
  let merged: ModularConfig = { ...DEFAULT_CONFIG };

  // 1. Global config (~/.pi/agent/lotusscript-modular.json)
  try {
    if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
      const raw = fs.readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
      merged = { ...merged, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }

  // 2. Project config (.pi/lotusscript-modular.json)
  const filePath = projectConfigPath(cwd);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<ModularConfig>;
      merged = { ...merged, ...parsed };
    } catch {
      // ignore
    }
  }

  return merged;
}

export function saveConfig(cwd: string, config: ModularConfig, isGlobal = false): void {
  if (isGlobal) {
    try {
      const dir = path.dirname(GLOBAL_CONFIG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LotusScript Modular] Failed to save global config: ${msg}`);
    }
    return;
  }

  const filePath = projectConfigPath(cwd);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[LotusScript Modular] Failed to save config: ${msg}`);
  }
}
