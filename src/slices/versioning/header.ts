/**
 * Versioning slice — pure parsing of the `VERZE` / `CHANGELOG` header block.
 *
 * No I/O, no state: the orchestrator (index.ts) reads the file and owns the
 * per-session baseline. Keeping the rules here makes them unit-testable and
 * stops the notice text from drifting away from the detection logic.
 */

export interface VersionBlock {
  /** Version as written ("1.8", "0.1"), or null when the header is absent. */
  version: string | null;
  /** Raw changelog lines (from `' CHANGELOG:` to the last comment line), or null. */
  changelog: string | null;
  /**
   * Canonical form of the whole block. Compared between two observations to
   * answer the only question that matters: was the version header touched?
   */
  raw: string;
}

/** `' VERZE: 1.8` — apostrophe, keyword, colon, dotted number. */
const VERZE_RE = /^\s*'\s*VERZE\s*:\s*([0-9]+(?:\.[0-9]+)*)\s*$/i;

/** `' CHANGELOG:` */
const CHANGELOG_RE = /^\s*'\s*CHANGELOG\s*:\s*$/i;

/** A comment line of the changelog body (indented entry or continuation). */
const COMMENT_RE = /^\s*'/;

export function extractVersionBlock(text: string): VersionBlock {
  const lines = text.split(/\r?\n/);

  let version: string | null = null;
  let versionLine = "";
  let changelogStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (version === null) {
      const m = VERZE_RE.exec(lines[i]);
      if (m) {
        version = m[1];
        versionLine = lines[i].trimEnd();
      }
    }
    if (changelogStart < 0 && CHANGELOG_RE.test(lines[i])) {
      changelogStart = i;
    }
    // The header lives in the top comment block; no need to scan a whole agent.
    if (version !== null && changelogStart >= 0) break;
  }

  let changelog: string | null = null;
  if (changelogStart >= 0) {
    const body: string[] = [lines[changelogStart].trimEnd()];
    for (let i = changelogStart + 1; i < lines.length; i++) {
      if (!COMMENT_RE.test(lines[i])) break;
      // A new `' VERZE:` is not changelog content (defensive against odd files).
      if (VERZE_RE.test(lines[i])) break;
      body.push(lines[i].trimEnd());
      if (body.length > 200) break; // bounded, never walk a whole file
    }
    changelog = body.join("\n");
  }

  const raw = [versionLine, changelog ?? ""].filter(Boolean).join("\n").trim();
  return { version, changelog, raw };
}

export type VersioningVerdict =
  | { kind: "ok" }
  /** The file has no version header at all. */
  | { kind: "missing" }
  /** The header exists but is byte-identical to the previous observation. */
  | { kind: "unchanged"; version: string };

/**
 * `previousRaw` is the canonical block observed earlier this session (on read
 * or on the previous edit). When it is undefined we have no baseline and must
 * not nag: a first sighting is always "ok".
 */
export function evaluateVersioning(
  current: VersionBlock,
  previousRaw: string | undefined
): VersioningVerdict {
  if (!current.version || current.changelog === null) return { kind: "missing" };
  if (previousRaw !== undefined && previousRaw === current.raw) {
    return { kind: "unchanged", version: current.version };
  }
  return { kind: "ok" };
}

/**
 * Suggested next version for the template text: a minor bump.
 * Deliberately a suggestion — the bump kind (patch/minor/major) is the
 * author's judgement and is documented in the reference.
 */
export function suggestNextVersion(version: string): string {
  const parts = version.split(".");
  const major = Number(parts[0]) || 0;
  const minor = Number(parts[1] ?? "0") || 0;
  return `${major}.${minor + 1}`;
}
