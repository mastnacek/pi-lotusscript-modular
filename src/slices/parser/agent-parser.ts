/**
 * AgentParser — stable static facade over the split parser modules
 * (sync-manifest, compile-agent). Kept as a class so existing call sites and
 * tests stay untouched; each module stays under the plugin's per-file limit.
 *
 * The decompile half of this facade (decompile-lss / decompile-dxl) was removed
 * on 2026-10-23 — see D:\01_programovani\pi\plugins\_archiv\lotusscript-dekompilace.
 */

import { syncManifest } from "./sync-manifest.js";
import { compileAgent } from "./compile-agent.js";

export class AgentParser {
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
