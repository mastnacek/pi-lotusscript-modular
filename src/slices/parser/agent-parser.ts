/**
 * AgentParser — stable static facade over the split parser modules
 * (decompile-lss, decompile-dxl, sync-manifest, compile-agent). Kept as a
 * class so existing call sites and tests stay untouched; each module stays
 * under the plugin's per-file line limit.
 */

import { decompileLss } from "./decompile-lss.js";
import { decompileDxl } from "./decompile-dxl.js";
import { syncManifest } from "./sync-manifest.js";
import { compileAgent } from "./compile-agent.js";

export class AgentParser {
  /** Decompile a bare LotusScript source file (.lss) into a modular folder. */
  static decompileLss(lssPath: string, outputDirOverride?: string): string {
    return decompileLss(lssPath, outputDirOverride);
  }

  /** Decompile a Domino Agent DXL XML file into a modular folder. */
  static decompileDxl(dxlPath: string, outputDirOverride?: string): string | null {
    return decompileDxl(dxlPath, outputDirOverride);
  }

  /** Synchronize manifest.json and main.lss with the files on disk. */
  static syncManifest(targetDirOrFile: string) {
    return syncManifest(targetDirOrFile);
  }

  /** Recompile modular files into a single .lss artifact. */
  static compileAgent(
    targetDirOrFile: string,
    options?: {
      keepTimestamp?: boolean;
      overwriteSourceLss?: boolean;
      createLssForDxl?: boolean;
      deleteModularDir?: boolean;
    }
  ): string {
    return compileAgent(targetDirOrFile, options);
  }
}
