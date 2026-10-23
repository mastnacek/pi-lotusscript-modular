import fs from "node:fs";
import path from "node:path";

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim().replace(/^[. ]+|[. ]+$/g, "");
}

export function getTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

export function decodeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Inserts `_n` before the extension: `sub_click.lss` + 2 → `sub_click_2.lss`. */
function insertOrdinal(fileName: string, n: number): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}_${n}`;
  return `${fileName.slice(0, dot)}_${n}${fileName.slice(dot)}`;
}

/**
 * Makes a list of candidate module file names collision-free, preserving order.
 *
 * A DXL form carries one `<code event='click'>` block per button, and a form
 * flattened into a single .lss carries one `Sub Click` body per button. Both
 * procedure module names from the event/procedure name
 * alone, so the second block overwrote the first and the modular folder
 * silently lost a button — the manifest then listed the same file twice.
 *
 * The FIRST occurrence keeps the plain name, so folders for single-event agents
 * stay byte-identical to before; later ones get `_2`, `_3`, … Counting is
 * case-insensitive, otherwise `Click` and `click` would still collide.
 *
 * Deterministic in the input order, which keeps repeated assemblies
 * stable: the same source always yields the same module names.
 */
export function makeUniqueFileNames(fileNames: string[]): string[] {
  const seen = new Map<string, number>();
  return fileNames.map((name) => {
    const key = name.toLowerCase();
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    return ordinal === 1 ? name : insertOrdinal(name, ordinal);
  });
}

export function detectProcPrefix(code: string): string {
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith("%REM") || trimmed.startsWith("%rem")) {
      continue;
    }
    if (/^(?:(?:Public|Private)\s+)?Sub\b/i.test(trimmed)) return "sub_";
    if (/^(?:(?:Public|Private)\s+)?Function\b/i.test(trimmed)) return "func_";
    if (/^(?:(?:Public|Private)\s+)?Property\s+(?:Get|Set)\b/i.test(trimmed)) return "prop_";
  }
  return "proc_";
}

export function findModularRoot(filePath: string): string | null {
  let cur = path.resolve(filePath);
  if (!fs.existsSync(cur)) return null;
  if (fs.statSync(cur).isFile()) {
    cur = path.dirname(cur);
  }
  while (cur && cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, "manifest.json")) && fs.existsSync(path.join(cur, "main.lss"))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return null;
}

export function getExistingModularDir(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".lss" && ext !== ".dxl") return null;
  const baseName = path.basename(resolved, ext);
  const potentialModularDir = path.join(path.dirname(resolved), baseName);
  if (
    fs.existsSync(potentialModularDir) &&
    fs.existsSync(path.join(potentialModularDir, "manifest.json")) &&
    fs.existsSync(path.join(potentialModularDir, "main.lss"))
  ) {
    return potentialModularDir;
  }
  return null;
}

export function isMonolithicLss(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  if (!resolved.toLowerCase().endsWith(".lss")) return false;
  if (resolved.toLowerCase().endsWith("_compiled.lss")) return false;
  if (path.basename(resolved).toLowerCase() === "main.lss") return false;

  if (findModularRoot(resolved)) return false;
  if (getExistingModularDir(resolved)) return false;

  const content = fs.readFileSync(resolved, "utf-8");
  const procs = content.match(/^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+\w+/gim) || [];
  const lineCount = content.split(/\r?\n/).length;
  return procs.length >= 2 || (procs.length >= 1 && lineCount > 20);
}

export function isMonolithicDxl(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  if (!resolved.toLowerCase().endsWith(".dxl")) return false;

  if (findModularRoot(resolved)) return false;
  if (getExistingModularDir(resolved)) return false;

  const content = fs.readFileSync(resolved, "utf-8");
  return /<code\s+event=['"](?:options|declarations|initialize|action|terminate)/i.test(content);
}

/**
 * True when a modular folder is still byte-for-byte the decompile output the
 * plugin produced. Compares every entry's mtime against the folder's own
 * `manifest.json` `decompileTimestamp`.
 *
 * This is deliberately git-free: LotusScript has no VCS, and the plugin must
 * not depend on the operator's repository to know what it owns. Anything the
 * plugin can observe changing on disk (an editor save, a shell that restores
 * files into the folder) makes the folder dirty and therefore untouchable.
 */
export function isPristineModularDir(modDir: string): boolean {
  const manifestPath = path.join(modDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return false;

  let stamp = Number.NaN;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { decompileTimestamp?: string };
    stamp = Date.parse(manifest.decompileTimestamp ?? "");
  } catch {
    return false;
  }
  if (Number.isNaN(stamp)) return false;

  // Filesystem mtime granularity is coarser than the ISO stamp: the decompile
  // itself writes files a few ms after the stamp is taken.
  // ponytail: 250 ms window — writes landing inside it read as pristine. Raise it
  // only if a real slow-FS agent ever trips a false "dirty".
  const toleranceMs = 250;
  for (const name of fs.readdirSync(modDir)) {
    const entry = path.join(modDir, name);
    try {
      if (fs.statSync(entry).mtimeMs > stamp + toleranceMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}
