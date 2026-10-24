/**
 * The plugin's icon family — botanical, rooted in 🪷.
 *
 * One emoji per verdict so every surface (HUD, chat notices, the check card)
 * reads with the same vocabulary. Emoji are language-neutral: they carry no
 * i18n cost, only the words around them resolve through `stringsFor`.
 * Widths are measured by pi-tui `visibleWidth` (verified for 🪷, U+1FAB7, and
 * the same single-codepoint emoji class); every consumer still clips lines
 * with `truncateToWidth`, so an exotic terminal can never crash the render.
 */
export const LOTUS = {
  /** The plugin marker — head of the HUD and the check card. */
  plugin: "🪷",
  /** Check verdict: clean. */
  clean: "🌸",
  /** Check verdict: compiler errors. */
  error: "🥀",
  /** Warning — something to look at, not a failure. */
  warn: "🍂",
  /** In progress / nothing known yet (seedling). */
  checking: "🌱",
  /** Not applicable — the oracle refused the file by name (e.g. .dxl). */
  skipped: "💮",
  /** Knowledge base segment. */
  kb: "🌿",
  /** New code planted (scaffold created). */
  planted: "🌱",
  /** Automated fix applied (auto-format). */
  fixed: "🍃",
} as const;
