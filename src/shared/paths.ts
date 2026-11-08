/**
 * Path helpers. Whole-file workflow only: a LotusScript source is one `.lss`
 * file, a DXL source is one Domino design-element XML — either a `.dxl` export
 * or a Designer ODP (on-disk project) design file (`.form`, `.view`, `.lsa`,
 * `.fa`, …) whose content is DXL even though the extension is not `.dxl`.
 */

import { closeSync, openSync, readSync } from "node:fs";

const DXL_EXT = /\.dxl$/i;
const FORMULA_EXT = /\.fl$/i;
const LOOSE_SCRIPT_EXT = /\.ls$/i;

/**
 * Designer ODP (on-disk project) stores design elements as DXL XML under
 * element-specific extensions instead of `.dxl`. Verified against a real
 * ODP export (nsfodp-export/01_nakupovaci_dokumentace_develop):
 *   .form/.subform/.view/.folder/.frameset/.page/.navigator/.outline → element XML
 *   .fa/.ja/.aa/.lsa (Code/Agents) → `<agent>` XML;  .lsdb → `<databasescript>` XML
 *   .lss.metadata → `<note class="filter">` XML (database element metadata)
 *
 * ODP also stores some elements WITHOUT any extension: `Code/actions/<name>`
 * (`<sharedactions>`), `Resources/IconNote` (`<note class='icon'>`),
 * `Resources/AboutDocument` (`<helpaboutdocument>`; UsingDocument may be
 * 0 bytes). Those are caught by the extensionless content sniff in
 * `isDxlSource`, not by this regex. `.lss` script libraries in ODP are raw
 * LotusScript (LSE `++LotusScript Development Environment` header), NOT DXL.
 */
const ODP_DXL_EXT =
  /\.(?:form|subform|view|folder|frameset|page|navigator|outline|sharedfield|sharedactions|imageresource|aboutdocument|usingdocument|stylesheet|agent|fa|ja|aa|lsdb|metadata)$/i;

/** Files whose DXL-ness depends on content, not extension. */
const AMBIGUOUS_DXL_EXT = /\.(?:lsa|xml)$/i;

/** The one marker every DXL dialect carries, single- or double-quoted. */
const DXL_XMLNS = /www\.lotus\.com\/dxl/i;
const DXL_SNIFF_BYTES = 4096;

/**
 * Content sniff: do the first bytes look like Domino DXL?
 *
 * Reads at most `DXL_SNIFF_BYTES` bytes and looks for the DXL namespace
 * marker (`xmlns[:=]['"]http://www.lotus.com/dxl`), quote-style agnostic.
 * Paths without a directory component are never sniffed (unresolvable —
 * opening them against the process cwd could hit an unrelated file).
 */
export function looksLikeDxl(filePath: string): boolean {
  if (!/[/\\]/.test(filePath)) return false;
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(DXL_SNIFF_BYTES);
    const read = readSync(fd, buf, 0, DXL_SNIFF_BYTES, 0);
    return DXL_XMLNS.test(buf.toString("utf8", 0, read));
  } catch {
    return false;
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
  }
}

/**
 * True for a LotusScript source file.
 *
 * `.lss` is unambiguous. `.lsa` is ambiguous: outside ODP it has been treated
 * as LotusScript, but a Designer ODP stores *agents* as `.lsa` DXL XML — so a
 * `.lsa` counts as LotusScript only when its content is not DXL.
 */
export function isLotusScriptSource(filePath: string): boolean {
  if (/\.lss$/i.test(filePath)) return true;
  if (/\.lsa$/i.test(filePath)) return !looksLikeDxl(filePath);
  return false;
}

/**
 * True for a DXL design element: `.dxl`, any Designer ODP design-element
 * extension, or an ambiguous file (`.lsa`, `.xml`) whose content sniffs as
 * DXL. Extensionless files (ODP `Code/actions/*`, `Resources/IconNote`,
 * `Resources/AboutDocument`, …) are content-sniffed too — the DXL namespace
 * marker is specific enough that false positives are implausible. Unknown
 * *extensions* stay out of scope (bounded detection).
 */
export function isDxlSource(filePath: string): boolean {
  if (DXL_EXT.test(filePath) || ODP_DXL_EXT.test(filePath)) return true;
  if (AMBIGUOUS_DXL_EXT.test(filePath)) return looksLikeDxl(filePath);
  if (!/\.[^/\\]+$/.test(filePath)) return looksLikeDxl(filePath);
  return false;
}

/** True for anything the KB edit gate protects (LotusScript or DXL sources). */
export function isLotusScriptOrDxl(filePath: string): boolean {
  return isLotusScriptSource(filePath) || isDxlSource(filePath);
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
