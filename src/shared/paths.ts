/**
 * Path helpers. Whole-file workflow only: a LotusScript source is one `.lss`
 * or `.dxl` file, so there is no folder/part resolution left here.
 */

const LOTUSSCRIPT_EXT = /\.(?:lss|lsa)$/i;
const DXL_EXT = /\.dxl$/i;

/** True for a LotusScript source file (`.lss` / `.lsa`). */
export function isLotusScriptSource(filePath: string): boolean {
  return LOTUSSCRIPT_EXT.test(filePath);
}

/** True for a DXL design-element export (`.dxl`). */
export function isDxlSource(filePath: string): boolean {
  return DXL_EXT.test(filePath);
}

/** True for anything the KB edit gate protects (`.lss` / `.dxl`). */
export function isLotusScriptOrDxl(filePath: string): boolean {
  return LOTUSSCRIPT_EXT.test(filePath) || DXL_EXT.test(filePath);
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim().replace(/^[. ]+|[. ]+$/g, "");
}
