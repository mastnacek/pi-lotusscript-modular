/**
 * Test-only AgentParser facade.
 *
 * The production decompiler (`src/slices/parser/decompile-lss.ts` +
 * `decompile-dxl.ts`) was removed on 2026-10-23; the archived originals live in
 * `D:\01_programovani\pi\plugins\_archiv\lotusscript-dekompilace`. Phase tests
 * still need to MATERIALIZE modular folders from a monolith (or a DXL export)
 * to exercise compilation, manifest sync, settle cleanup and the LSP lane, so
 * the two decompilers are kept here, verbatim, as fixture builders. Nothing in
 * `src/` imports this file and `files` in package.json does not ship `test/`.
 */

import { decompileLss } from "./decompile-lss.js";
import { decompileDxl } from "./decompile-dxl.js";
import { AgentParser as ProductionParser } from "../../src/slices/parser/index.js";

export class AgentParser extends ProductionParser {
  /** Test fixture: split a monolithic .lss into a modular folder. */
  static decompileLss(lssPath: string, outputDirOverride?: string): string {
    return decompileLss(lssPath, outputDirOverride);
  }

  /** Test fixture: split a Domino agent DXL into a modular folder. */
  static decompileDxl(dxlPath: string, outputDirOverride?: string): string | null {
    return decompileDxl(dxlPath, outputDirOverride);
  }
}
