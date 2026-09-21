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

/** A monolithic LotusScript reference found inside a shell command or code snippet. */
export interface MonolithicReadHit {
  /** Path exactly as written in the command/code. */
  referenced: string;
  /** Absolute resolved path. */
  resolved: string;
  /** Existing sibling modular directory, when one already exists. */
  modularRoot: string | null;
}

/**
 * File-name shapes that belong to a modular folder and are safe to inspect.
 * A monolithic agent file never matches any of these.
 */
const MODULAR_PART_NAME =
  /^(?:main\.lss|0{2}_.*\.lss|0{1}_.*\.lss|99_.*\.lss|sub_.*\.lss|func_.*\.lss|prop_.*\.lss|.*_compiled\.lss)$/i;

/**
 * Positive read-intent signals: a tool that can dump file CONTENT.
 * Metadata-only commands (wc, ls, dir, stat, find, git) are intentionally absent.
 */
const CONTENT_READ_INTENT =
  /(?:\bcat\b|\bsed\b|\bhead\b|\btail\b|\bmore\b|\bless\b|\bawk\b|\bperl\b|\bpython3?\b|\bnode\b|\bruby\b|\bphp\b|Get-Content|\bgc\b|Select-String|\brg\b|\bgrep\b|\bfindstr\b|readFileSync|readFile\b|read_text|readlines|\bopen\s*\(|\btype\s+["']?[A-Za-z0-9_.\\/:-]+\.(?:lss|dxl))/i;

/** Extracts every `.lss` / `.dxl` path token from arbitrary command text. */
function extractScriptPathTokens(text: string): string[] {
  const tokens = new Set<string>();
  const pattern = /(?:[A-Za-z]:[\\/])?[\w.\-\\/]*[\w.\-]\.(?:lss|dxl)\b/gi;
  for (const match of text.matchAll(pattern)) {
    tokens.add(match[0]);
  }
  return [...tokens];
}

/**
 * Directories a command switches into before touching the file: `cd <dir>` and
 * `--cwd <dir>`. Without these, a relative token like `tlacitko.lss` in
 * `cd 01_scripts && cat tlacitko.lss` would resolve against the session cwd and
 * the monolithic file would never be found.
 */
function extractDirectoryHints(text: string, base: string): string[] {
  const dirs: string[] = [];
  const patterns = [
    /(?:^|[;&|]|\bthen\b)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gi,
    /--cwd[=\s]+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? match[2] ?? match[3];
      if (!raw) continue;
      const resolved = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(base, raw);
      if (fs.existsSync(resolved)) dirs.push(resolved);
    }
  }

  return dirs;
}

/**
 * Finds monolithic LotusScript files that a shell command or code snippet would
 * read through a content-dumping tool. Returns [] when no read intent exists, when
 * only metadata commands are used, or when every referenced file is a modular part
 * or a generated artifact.
 *
 * Used to block the `cat tlacitko.lss | sed -n '1,400p'` escape hatch that bypasses
 * read-time auto-decompilation.
 */
export function findMonolithicScriptReads(text: string, cwd?: string): MonolithicReadHit[] {
  if (!text || !CONTENT_READ_INTENT.test(text)) return [];

  const base = path.resolve(cwd || process.cwd());
  const bases = [base, ...extractDirectoryHints(text, base)];
  const hits: MonolithicReadHit[] = [];
  const seen = new Set<string>();

  for (const token of extractScriptPathTokens(text)) {
    const name = path.basename(token).toLowerCase();
    if (MODULAR_PART_NAME.test(name)) continue;

    for (const candidateBase of bases) {
      const resolved = path.isAbsolute(token) ? path.normalize(token) : path.resolve(candidateBase, token);
      if (seen.has(resolved)) break;
      if (!fs.existsSync(resolved)) continue;
      if (!fs.statSync(resolved).isFile()) break;

      // A file that already lives inside a modular folder is not monolithic.
      if (findModularRoot(resolved)) break;

      seen.add(resolved);
      hits.push({
        referenced: token,
        resolved,
        modularRoot: getExistingModularDir(resolved),
      });
      break;
    }
  }

  return hits;
}
