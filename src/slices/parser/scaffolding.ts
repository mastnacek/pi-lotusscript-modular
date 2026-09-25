/**
 * Generated artifact scaffolding — the `%REM` provenance header and the
 * `' === SECTION: <file> ===` markers that `compileAgent` prepends/appends to
 * every assembled artifact.
 *
 * Single source of truth for both directions of the round trip:
 *  - `compile-agent.ts` WRITES these markers (via the builders below);
 *  - `decompile-lss.ts` STRIPS them before parsing, and `compile-agent.ts`
 *    strips them again per modular file.
 *
 * Without the strip, every `compile → decompile` cycle re-ingests the markers
 * of the previous artifact as declarations content, so `01_declarations.lss`
 * nests one more header + section block per cycle and the artifact grows
 * without bound.
 */

/** Marker line identifying the generated provenance header inside a `%REM` block. */
export const ASSEMBLED_HEADER_MARKER = "Assembled from modular source files";

const SECTION_TAG_RE = /^\s*'\s*===\s*(?:END\s+)?SECTION:.*===\s*$/i;
const REM_START_RE = /^\s*%REM\b/i;
const REM_END_RE = /^\s*%END\s*REM\b/i;

/** True for a generated `' === SECTION: x ===` / `' === END SECTION: x ===` line. */
export function isSectionTagLine(line: string): boolean {
  return SECTION_TAG_RE.test(line);
}

/** Builds the opening marker for one modular file inside the artifact. */
export function sectionTag(fileName: string): string {
  return `' === SECTION: ${fileName} ===`;
}

/** Builds the closing marker for one modular file inside the artifact. */
export function endSectionTag(fileName: string): string {
  return `' === END SECTION: ${fileName} ===`;
}

/** Builds the provenance header written at the top of every artifact. */
export function buildArtifactHeader(agentName: string, compiledIso: string): string[] {
  return [
    "%REM",
    `    Agent: ${agentName}`,
    `    ${ASSEMBLED_HEADER_MARKER}`,
    `    Compiled: ${compiledIso}`,
    `    Target: Paste entire content into Domino Designer agent`,
    "%END REM",
    "",
  ];
}

/**
 * Removes generated scaffolding from a text block: every section marker line and
 * every `%REM` block carrying `ASSEMBLED_HEADER_MARKER`. Everything else — user
 * `%REM` documentation blocks included — is preserved byte for byte.
 */
export function stripArtifactScaffolding(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isSectionTagLine(line)) continue;

    if (REM_START_RE.test(line)) {
      let end = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (REM_END_RE.test(lines[j]!)) {
          end = j;
          break;
        }
      }
      const block = lines.slice(i, end + 1);
      if (block.some((b) => b.includes(ASSEMBLED_HEADER_MARKER))) {
        i = end;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}
