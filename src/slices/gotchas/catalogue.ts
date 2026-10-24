import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GotchaItem } from "../../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_GOTCHAS_PATH = path.join(__dirname, "gotchas.md");
const DEFAULT_GLOBAL_GOTCHAS_DIR = path.join(os.homedir(), ".pi", "lotusscript");

let cachedGotchas: GotchaItem[] | null = null;
let lastMtimeMs = 0;
let syncedThisProcess = false;

/**
 * User store directory. `LOTUSSCRIPT_GOTCHAS_DIR` overrides it — used by the
 * test suite so a run never rewrites the operator's live registry.
 */
function globalGotchasDir(): string {
  return process.env.LOTUSSCRIPT_GOTCHAS_DIR || DEFAULT_GLOBAL_GOTCHAS_DIR;
}

function globalGotchasPath(): string {
  return path.join(globalGotchasDir(), "gotchas.md");
}

/**
 * Titles dropped from the user copy on load, because the text they carry is no
 * longer true:
 * - a removed feature (the modular decompiler) — nothing re-appends them;
 * - a corrected entry that also exists in the bundled seed — the generic
 *   "append bundled titles that are missing" step re-seeds it with current text.
 * Matching is normalised (case, punctuation, spacing), never a raw string compare.
 */
const SUPERSEDED_TITLES = [
  // Decompiler-era toolchain behaviour: there is no decompile step any more.
  "[toolchain] A `Účel:` comment above a procedure disappears on recompile",
  "[toolchain] `' === SECTION: … ===` and `%REM … Assembled from modular source files` are generated",
  // Bodies corrected in the seed (renamed tool `lotusscript_check`, no DXL round-trip).
  '`Call Messagebox(...)` se nepřeloží: Unexpected: MessageBox; Expected: Identifier',
  '`db.Open ""` bez obou parametrů: Unexpected: ""; Expected: ELSE',
  "`server$ As String` se nepřeloží: Declaration may not contain type suffix and data type",
] as const;

/** Collapses a title to a comparison key: case, backticks and punctuation insensitive. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUPERSEDED_KEYS = new Set(SUPERSEDED_TITLES.map(titleKey));
const SEPARATOR_LINE = /^\s*-{3,}\s*$/;

interface GotchaBlock {
  title: string;
  /** Exact source text of the block, including its leading `---` separator run. */
  raw: string;
}

/** Splits a registry file into its preamble plus per-entry blocks. */
function splitBlocks(text: string): { preamble: string; blocks: GotchaBlock[] } {
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];

  // A new entry starts at "## " only when it is the first heading, or when the
  // previous non-empty line is a "---" separator. A "## Sub-heading" inside an
  // entry body (the shape addGotcha() writes) stays part of that entry.
  let prevNonEmpty = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (line.startsWith("## ") && (starts.length === 0 || SEPARATOR_LINE.test(prevNonEmpty))) {
      starts.push(i);
    }
    if (trimmed) prevNonEmpty = trimmed;
  }

  if (starts.length === 0) return { preamble: text, blocks: [] };

  // The whole separator run (plus the blank lines around it) belongs to the
  // entry below it, never to the body above it — otherwise a repeated sync
  // would let separators accumulate inside entry bodies.
  const blockStarts = starts.map((start) => {
    let first = start;
    for (let j = start - 1; j >= 0; j--) {
      const t = (lines[j] ?? "").trim();
      if (!t || SEPARATOR_LINE.test(t)) {
        first = j;
        continue;
      }
      break;
    }
    return first;
  });

  const blocks: GotchaBlock[] = starts.map((start, idx) => ({
    title: (lines[start] ?? "").replace(/^##\s+/, "").trim(),
    raw: lines.slice(blockStarts[idx] ?? start, blockStarts[idx + 1] ?? lines.length).join("\n"),
  }));

  const preamble = lines.slice(0, blockStarts[0] ?? starts[0] ?? 0).join("\n");
  return { preamble, blocks };
}

/** Drops any leading separator run so a block starts at its `## title`. */
function withoutLeadingSeparator(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.trimStart().startsWith("## "));
  const from = titleIdx >= 0 ? titleIdx : 0;
  return lines.slice(from).join("\n").replace(/\s+$/, "");
}

/** Preamble without a dangling separator, followed by exactly one blank line. */
function renderPreamble(preamble: string): string {
  const lines = preamble.split(/\r?\n/);
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (!t || SEPARATOR_LINE.test(t)) {
      end = i;
      continue;
    }
    break;
  }
  const kept = lines.slice(0, end).join("\n").replace(/\s+$/, "");
  return kept ? `${kept}\n\n` : "";
}

/** Body of a block: everything after its `## title` line. */
function blockBody(block: GotchaBlock): string {
  const lines = block.raw.split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.trimStart().startsWith("## "));
  return lines
    .slice(titleIdx + 1)
    .join("\n")
    .trim();
}

/**
 * Brings the user copy up to date without ever touching entries the operator
 * wrote: superseded titles are dropped, bundled entries missing from the copy
 * are appended, and the separator layout is normalised to exactly one `---`
 * between entries. Writes only when the result differs (idempotent), so a
 * package update propagates corrections instead of being pinned to the first
 * seed forever, and a file damaged by an older sync repairs itself.
 */
function syncGlobalGotchas(targetPath: string): void {
  if (syncedThisProcess) return;
  syncedThisProcess = true;

  try {
    if (!fs.existsSync(BUNDLED_GOTCHAS_PATH) || !fs.existsSync(targetPath)) return;
    const bundled = splitBlocks(fs.readFileSync(BUNDLED_GOTCHAS_PATH, "utf-8"));
    const currentText = fs.readFileSync(targetPath, "utf-8");
    const current = splitBlocks(currentText);

    const kept = current.blocks.filter((b) => !SUPERSEDED_KEYS.has(titleKey(b.title)));
    const present = new Set(kept.map((b) => titleKey(b.title)));
    const additions = bundled.blocks.filter((b) => !present.has(titleKey(b.title)));

    const rendered = [
      ...kept.map((block) => withoutLeadingSeparator(block.raw)),
      ...additions.map((block) => `## ${block.title}\n\n${blockBody(block)}`),
    ];
    // One `---` before every entry (the seed's own layout), so a heading is
    // always an entry boundary no matter where the file is read from.
    const head = renderPreamble(current.preamble);
    const body = rendered.join("\n\n---\n\n");
    const next = head ? `${head}---\n\n${body}\n` : `${body}\n`;
    if (next !== currentText) {
      fs.writeFileSync(targetPath, next, "utf-8");
      cachedGotchas = null;
    }
  } catch (err: unknown) {
    console.error(`[LotusScript Modular] Failed to sync global gotchas file: ${err}`);
  }
}

/**
 * Returns the effective path to the shared gotchas.md file.
 * Seeds ~/.pi/lotusscript/gotchas.md from the bundled catalogue on first use and
 * keeps it in sync afterwards, so user gotchas persist across package updates
 * and are shared across projects.
 */
export function getEffectiveGotchasPath(): string {
  const target = globalGotchasPath();
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(globalGotchasDir(), { recursive: true });
      if (fs.existsSync(BUNDLED_GOTCHAS_PATH)) {
        fs.copyFileSync(BUNDLED_GOTCHAS_PATH, target);
      }
    } catch (err: unknown) {
      console.error(`[LotusScript Modular] Failed to initialize global gotchas file: ${err}`);
      return BUNDLED_GOTCHAS_PATH;
    }
  }
  syncGlobalGotchas(target);
  return fs.existsSync(target) ? target : BUNDLED_GOTCHAS_PATH;
}

function parseGotchasFile(filePath: string): GotchaItem[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf-8");
  return splitBlocks(text).blocks.map((block) => ({
    id: block.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-"),
    title: block.title,
    body: blockBody(block),
  }));
}

export function getAllGotchas(): GotchaItem[] {
  try {
    const targetPath = getEffectiveGotchasPath();
    const stat = fs.statSync(targetPath);
    if (!cachedGotchas || stat.mtimeMs !== lastMtimeMs) {
      cachedGotchas = parseGotchasFile(targetPath);
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
  const targetPath = getEffectiveGotchasPath();
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  const id = cleanTitle
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const entry = `\n\n---\n\n## ${cleanTitle}\n\n${cleanBody}\n`;
  // The user-owned global file is the single durable store. Never write back
  // to the bundled copy: in an installed package it is a git working tree that
  // `pi update` reconciles, so a local append is clobbered (or blocks the pull).
  fs.appendFileSync(targetPath, entry, "utf-8");

  cachedGotchas = null;
  return { id, title: cleanTitle, body: cleanBody };
}
