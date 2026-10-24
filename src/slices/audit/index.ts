/**
 * Audit slice — "which of these agents should be a script library?"
 *
 * Static analysis only, no compiler: every `.lss` in a folder is parsed into
 * procedures, their bodies are normalised (comments and formatting removed) and
 * identical bodies are grouped. A body that exists in two or more *different*
 * files is the promotion signal described in
 * `references/libraries-and-versioning.md` §1 — the rule of three written as a
 * measurement.
 *
 * Deliberately not detected here: which *constructs* belong to a library
 * (HTTP COM, endpoint literals, error reports). That is the `drift` slice's job
 * and runs on every edit; this audit answers the larger "what should move".
 */

import fs from "node:fs";
import path from "node:path";

/** Procedures shorter than this are below the promotion threshold. */
const MIN_LINES = 8;
/** Report cap — a wall of rows is not actionable. */
const MAX_GROUPS = 10;

export interface ProcFact {
  name: string;
  lines: number;
  normalized: string;
}

export interface DupGroup {
  /** Procedure name as written in the first file that had it. */
  name: string;
  lines: number;
  files: string[];
  /** Lines removable by moving it into a library: lines × (files − 1). */
  saved: number;
}

export interface AuditReport {
  dir: string;
  filesScanned: number;
  procedures: number;
  groups: DupGroup[];
  savedLines: number;
  libraryFiles: string[];
}

const PROC_RE = /^\s*(?:Public\s+|Private\s+)?(?:Function|Sub)\s+(\w+)/i;
const END_RE = /^\s*End\s+(?:Function|Sub)\b/i;

/** Split a whole `.lss` into procedures with a normalised body. */
export function extractProcedures(text: string): ProcFact[] {
  const lines = text.split(/\r?\n/);
  const out: ProcFact[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = PROC_RE.exec(lines[i]);
    if (!m) continue;

    const start = i;
    let end = i;
    while (end < lines.length && !END_RE.test(lines[end])) end++;
    const body = lines.slice(start, end + 1);
    i = end;

    // Normalise for comparison: drop comments, collapse whitespace.
    const normalized = body
      .map((l) => l.replace(/'[^"']*$/, ""))
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 0)
      .join("\n");

    if (normalized.length > 0) {
      out.push({ name: m[1], lines: body.length, normalized });
    }
  }

  return out;
}

/** Identical normalised bodies living in ≥2 different files. */
export function findDuplicates(input: ReadonlyArray<{ file: string; text: string }>): DupGroup[] {
  const byBody = new Map<string, { name: string; lines: number; files: Set<string> }>();

  for (const { file, text } of input) {
    for (const proc of extractProcedures(text)) {
      if (proc.lines < MIN_LINES) continue;
      const entry = byBody.get(proc.normalized);
      if (!entry) {
        byBody.set(proc.normalized, { name: proc.name, lines: proc.lines, files: new Set([file]) });
      } else {
        entry.files.add(file);
        entry.lines = Math.min(entry.lines, proc.lines);
      }
    }
  }

  const groups: DupGroup[] = [];
  for (const entry of byBody.values()) {
    if (entry.files.size < 2) continue;
    const files = [...entry.files].sort();
    groups.push({
      name: entry.name,
      lines: entry.lines,
      files,
      saved: entry.lines * (files.length - 1),
    });
  }

  return groups.sort((a, b) => b.saved - a.saved).slice(0, MAX_GROUPS);
}

/** Read every `.lss` in one folder (non-recursive, backups skipped). */
export function auditProject(dir: string): AuditReport {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /\.lss$/i.test(n) && !/\.bak-/i.test(n));
  } catch {
    return { dir, filesScanned: 0, procedures: 0, groups: [], savedLines: 0, libraryFiles: [] };
  }

  const input = names.map((file) => ({ file, text: safeRead(path.join(dir, file)) }));
  const groups = findDuplicates(input);
  const procedures = input.reduce((n, f) => n + extractProcedures(f.text).length, 0);

  return {
    dir,
    filesScanned: names.length,
    procedures,
    groups,
    savedLines: groups.reduce((n, g) => n + g.saved, 0),
    libraryFiles: names.filter((n) => /^lib_/i.test(n)),
  };
}

function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** User-facing markdown report. */
export function renderAudit(report: AuditReport, lang = "cs"): string {
  const cs = lang !== "en";
  const L = cs
    ? {
        head: "📚 Audit knihoven",
        files: "souborů",
        procs: "procedur",
        libs: "knihoven v adresáři",
        none: "Žádná procedura se v adresáři neopakuje napříč soubory — není co povýšit.",
        found: "Opakované procedury (kandidáti na knihovnu):",
        colName: "Procedura",
        colLines: "Řádků",
        colFiles: "Souborů",
        colSaved: "Ušetří",
        total: "Přesunem by zmizelo přibližně",
        next: "Další krok: `/ls scaffold library lib_<x>`, přesunout tělo a v elementech nechat jen volání.",
      }
    : {
        head: "📚 Library audit",
        files: "files",
        procs: "procedures",
        libs: "libraries in folder",
        none: "No procedure repeats across files — nothing to promote.",
        found: "Repeated procedures (library candidates):",
        colName: "Procedure",
        colLines: "Lines",
        colFiles: "Files",
        colSaved: "Saves",
        total: "Moving them would remove about",
        next: "Next: `/ls scaffold library lib_<x>`, move the body, leave only a call in each element.",
      };

  const out: string[] = [
    `${L.head}: ${report.dir}`,
    `   ${report.filesScanned} ${L.files} · ${report.procedures} ${L.procs} · ${report.libraryFiles.length} ${L.libs}`,
    "",
  ];

  if (report.groups.length === 0) {
    out.push(L.none);
    return out.join("\n");
  }

  out.push(L.found, "");
  out.push(`| ${L.colName} | ${L.colLines} | ${L.colFiles} | ${L.colSaved} |`);
  out.push("|---|---|---|---|");
  for (const g of report.groups) {
    out.push(`| \`${g.name}\` | ${g.lines} | ${g.files.length} | ${g.saved} |`);
  }
  out.push("", `${L.total} ${report.savedLines} ${L.colLines.toLowerCase()}.`, "", L.next);
  return out.join("\n");
}

/** Shape handed to the commands slice (markdown pre-rendered, no slice import). */
export interface AuditResultLite {
  markdown: string;
  duplicates: number;
  files: number;
  /** Lines removable by promoting the duplicates — the compact toast's headline. */
  savedLines: number;
}

export function auditForCommand(dir: string, lang: string): AuditResultLite {
  const report = auditProject(dir);
  return {
    markdown: renderAudit(report, lang),
    duplicates: report.groups.length,
    files: report.filesScanned,
    savedLines: report.savedLines,
  };
}

/** Suggested library element name for a plan (kept deterministic). */
export function suggestLibraryName(report: AuditReport): string {
  const hint = report.groups[0]?.name.toLowerCase() ?? "shared";
  const slug = hint.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "shared";
  return `lib_${slug}`;
}

/** Migration plan for the top candidates — what to scaffold and what to touch. */
export function renderPlan(report: AuditReport, lang = "cs"): string {
  const cs = lang !== "en";
  if (report.groups.length === 0) {
    return cs ? "📋 Není co povyšovat — žádná procedura se neopakuje." : "📋 Nothing to promote — no procedure repeats.";
  }

  const lib = suggestLibraryName(report);
  const out: string[] = [
    cs ? `📋 Plán povýšení do \`${lib}\`` : `📋 Promotion plan for \`${lib}\``,
    cs
      ? `   \`/ls scaffold library ${lib}\`  (nebo lotusscript_scaffold type=library)`
      : `   \`/ls scaffold library ${lib}\`  (or lotusscript_scaffold type=library)`,
    "",
  ];

  const top = report.groups.slice(0, 3);
  top.forEach((g, i) => {
    const files = g.files.slice(0, 6).join(", ") + (g.files.length > 6 ? ", …" : "");
    out.push(`${i + 1}. \`${g.name}\` — ${g.lines} ${cs ? "řádků" : "lines"}, ${g.files.length} ${cs ? "souborů" : "files"} (${cs ? "ušetří" : "saves"} ${g.saved})`);
    out.push(`   ${cs ? "dotčené soubory" : "affected files"}: ${files}`);
  });

  out.push(
    "",
    cs
      ? "Po přesunu: v každém elementu přepsat `Use` na novou knihovnu, zkontrolovat tělo proti odstraněným procedurám a spustit Tools → Recompile All LotusScript."
      : "After the move: switch each element's `Use` to the new library, check the body for removed procedures, then Tools → Recompile All LotusScript."
  );
  return out.join("\n");
}

/** Markdown for the model tool: the audit, optionally followed by the plan. */
export function auditForTool(dir: string, lang: string, plan: boolean): AuditResultLite {
  const report = auditProject(dir);
  const markdown = plan ? `${renderAudit(report, lang)}\n\n${renderPlan(report, lang)}` : renderAudit(report, lang);
  return {
    markdown,
    duplicates: report.groups.length,
    files: report.filesScanned,
    savedLines: report.savedLines,
  };
}
