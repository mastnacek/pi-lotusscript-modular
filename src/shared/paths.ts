/**
 * Path helpers. Whole-file workflow only: a LotusScript source is one `.lss`
 * or `.dxl` file, so there is no folder/part resolution left here.
 */

const LOTUSSCRIPT_EXT = /\.(?:lss|lsa)$/i;
const DXL_EXT = /\.dxl$/i;
const FORMULA_EXT = /\.fl$/i;
const LOOSE_SCRIPT_EXT = /\.ls$/i;

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

/** True for a formula-language artifact (`.fl`). */
export function isFormulaSource(filePath: string): boolean {
  return FORMULA_EXT.test(filePath);
}

/**
 * True for a bare LotusScript dump (`.ls`).
 *
 * Evidence of a Domino project, but NOT a whole-file `.lss` script: nothing
 * compiles, gates or banners it — only project detection looks at it.
 */
export function isLooseScript(filePath: string): boolean {
  return LOOSE_SCRIPT_EXT.test(filePath);
}
