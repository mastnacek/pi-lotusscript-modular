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
