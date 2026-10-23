/**
 * Project detection — is this workspace a Domino / LotusScript project?
 *
 * Deliberately bounded: `before_agent_start` and the first `.lss` read must
 * never pay for a repository walk. The scan inspects at most `MAX_DEPTH`
 * directory levels, skips VCS / dependency / plugin directories and stops at
 * the first evidence file, so a huge monorepo costs a handful of `readdir`
 * calls. `createProjectDetector` memoizes the result for one session root;
 * nothing is cached across sessions.
 *
 * False positives are cheap here — the result only decides whether the model
 * is pointed at the entry skill — but the skip list still matters: `.pi/` can
 * hold this plugin's own fixtures and `node_modules/` ships vendored samples.
 */

import fs from "node:fs";
import path from "node:path";
import type { ProjectEvidenceKind, ProjectFingerprint } from "../../shared/types.js";
import * as paths from "../../shared/paths.js";

/** Directory levels inspected below the root (root = 0, so 0..2). */
export const MAX_DEPTH = 2;
/** Hard cap on directory entries inspected before the scan reports truncation. */
export const MAX_ENTRIES = 4000;
/** Wall-clock budget for one scan; the UI must never wait on it. */
export const BUDGET_MS = 100;

/** Never walked: VCS, package managers, build output, tool caches. */
const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bin",
  "obj",
  "dist",
  "target",
  "out",
  "coverage",
  ".next",
  ".venv",
  "__pycache__",
  ".ruff_cache",
  ".pytest_cache",
]);

export interface DetectOptions {
  /** Max directory depth below the root (default `MAX_DEPTH`). */
  maxDepth?: number;
  /** Max entries inspected (default `MAX_ENTRIES`). */
  maxEntries?: number;
  /** Wall-clock budget in ms (default `BUDGET_MS`). */
  budgetMs?: number;
}

function kindOf(fileName: string): ProjectEvidenceKind | null {
  if (paths.isLotusScriptSource(fileName)) return "lss";
  if (paths.isDxlSource(fileName)) return "dxl";
  if (paths.isFormulaSource(fileName)) return "formula";
  if (paths.isLooseScript(fileName)) return "loose";
  return null;
}

function skipDir(name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name.toLowerCase());
}

/**
 * Bounded, shallowest-first scan for one evidence file.
 *
 * BFS rather than DFS so the reported `sampleFile` is the one closest to the
 * root (`01_scripts/ExportDXL.lss` beats a nested copy three levels down), and
 * the scan returns at the first hit — depth and entry caps only matter for
 * projects that have no evidence at all.
 */
export function detectLotusScriptProject(
  cwd: string,
  options: DetectOptions = {}
): ProjectFingerprint {
  const root = path.resolve(cwd || process.cwd());
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const deadline = Date.now() + (options.budgetMs ?? BUDGET_MS);

  const fingerprint: ProjectFingerprint = {
    root,
    hasLotusScript: false,
    scanned: 0,
    truncated: false,
  };

  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let cursor = 0;

  while (cursor < queue.length) {
    if (fingerprint.scanned >= maxEntries || Date.now() > deadline) {
      fingerprint.truncated = true;
      return fingerprint;
    }

    const { dir, depth } = queue[cursor++];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory (permissions, race) — skip, never throw
    }

    for (const entry of entries) {
      if (fingerprint.scanned >= maxEntries) {
        fingerprint.truncated = true;
        return fingerprint;
      }
      fingerprint.scanned++;

      if (entry.isDirectory()) {
        if (depth < maxDepth && !skipDir(entry.name)) {
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const kind = kindOf(entry.name);
      if (!kind) continue;

      const absolute = path.join(dir, entry.name);
      fingerprint.hasLotusScript = true;
      fingerprint.kind = kind;
      fingerprint.sampleFile = path.relative(root, absolute) || entry.name;
      return fingerprint;
    }
  }

  return fingerprint;
}

export interface ProjectDetector {
  /** Cached fingerprint for `cwd` — one bounded scan per session root. */
  detect(cwd: string): ProjectFingerprint;
  /** Forget the cache (new session, reload, new working directory). */
  reset(): void;
}

/** Session-scoped memo around `detectLotusScriptProject`. */
export function createProjectDetector(): ProjectDetector {
  let cache: { root: string; fingerprint: ProjectFingerprint } | null = null;

  return {
    detect(cwd: string): ProjectFingerprint {
      const root = path.resolve(cwd || process.cwd());
      if (cache && cache.root === root) return cache.fingerprint;
      const fingerprint = detectLotusScriptProject(root);
      cache = { root, fingerprint };
      return fingerprint;
    },
    reset(): void {
      cache = null;
    },
  };
}
