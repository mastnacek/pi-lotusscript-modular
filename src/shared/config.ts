import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ModularConfig } from "./types.js";

export const DEFAULT_CONFIG: ModularConfig = {
  enableLsp: false,
  autoDecompileOnRead: true,
  autoRecompileOnSave: true,
  keepTimestampInCompiledName: false,
  overwriteSourceLss: true,
  enforceKbPrompt: true,
  injectGotchasSummary: true,
  enforceGotchaCapture: true,
};

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, CONFIG_DIR_NAME, "lotusscript-modular.json");
}

export function loadConfig(cwd: string): ModularConfig {
  const filePath = projectConfigPath(cwd);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<ModularConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cwd: string, config: ModularConfig): void {
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
