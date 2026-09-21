import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GotchaItem } from "../../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GOTCHAS_MD_PATH = path.join(__dirname, "gotchas.md");

let cachedGotchas: GotchaItem[] | null = null;
let lastMtimeMs = 0;

function parseGotchasFile(filePath: string): GotchaItem[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  const items: GotchaItem[] = [];

  let currentTitle = "";
  let currentBodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      if (currentTitle) {
        const body = currentBodyLines.join("\n").trim();
        const id = currentTitle
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        items.push({ id, title: currentTitle, body });
      }
      currentTitle = line.replace("## ", "").trim();
      currentBodyLines = [];
    } else {
      currentBodyLines.push(line);
    }
  }

  if (currentTitle) {
    const body = currentBodyLines.join("\n").trim();
    const id = currentTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    items.push({ id, title: currentTitle, body });
  }

  return items;
}

export function getAllGotchas(): GotchaItem[] {
  try {
    const stat = fs.statSync(GOTCHAS_MD_PATH);
    if (!cachedGotchas || stat.mtimeMs !== lastMtimeMs) {
      cachedGotchas = parseGotchasFile(GOTCHAS_MD_PATH);
      lastMtimeMs = stat.mtimeMs;
    }
    return cachedGotchas;
  } catch {
    return [];
  }
}

export function searchGotchas(query: string, limit = 5): GotchaItem[] {
  const all = getAllGotchas();
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);

  const matched: { item: GotchaItem; score: number }[] = [];

  for (const item of all) {
    const t = item.title.toLowerCase();
    const b = item.body.toLowerCase();
    let score = 0;

    if (t.includes(q)) score += 10;
    if (b.includes(q)) score += 2;

    const words = q.split(/\s+/);
    for (const w of words) {
      if (w.length < 2) continue;
      if (t.includes(w)) score += 3;
      if (b.includes(w)) score += 1;
    }

    if (score > 0) {
      matched.push({ item, score });
    }
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, limit).map((m) => m.item);
}

export function getGotchasSummary(limit = 12): string {
  const all = getAllGotchas();
  const top = all.slice(0, limit);
  const lines: string[] = [
    "⚠️ Top Critical LotusScript Gotchas (IBM Notes/Domino 9.0.1):",
  ];
  top.forEach((g, idx) => {
    lines.push(`  ${idx + 1}. ${g.title}`);
  });
  lines.push(`(Total ${all.length} gotchas available — query with tool 'lotusscript_gotchas' or command '/ls gotchas <query>')`);
  return lines.join("\n");
}

export function addGotcha(title: string, body: string): GotchaItem {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  const id = cleanTitle
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const entry = `\n\n---\n\n## ${cleanTitle}\n\n${cleanBody}\n`;
  fs.appendFileSync(GOTCHAS_MD_PATH, entry, "utf-8");

  cachedGotchas = null;
  return { id, title: cleanTitle, body: cleanBody };
}
