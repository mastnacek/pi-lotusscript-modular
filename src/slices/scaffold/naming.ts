/**
 * Alias derivation + Designer registration notice builder.
 * Convention source of truth: skills/lotusscript-modular/references/naming-conventions.md
 */

const DIACRITICS_MAP: Record<string, string> = {
  á: "a", à: "a", â: "a", ä: "a", ā: "a", ã: "a",
  č: "c", ć: "c", ç: "c", ĉ: "c",
  ď: "d", đ: "d",
  é: "e", è: "e", ê: "e", ë: "e", ē: "e", ě: "e",
  í: "i", ì: "i", î: "i", ï: "i", ī: "i",
  ľ: "l", ĺ: "l", ł: "l",
  ň: "n", ń: "n", ñ: "n",
  ó: "o", ò: "o", ô: "o", ö: "o", ō: "o", õ: "o",
  ř: "r", ŕ: "r",
  š: "s", ś: "s", ş: "s", ß: "ss",
  ť: "t",
  ú: "u", ù: "u", û: "u", ü: "u", ů: "u", ū: "u",
  ý: "y", ÿ: "y",
  ž: "z", ź: "z", ż: "z",
};

const MAX_ALIAS_LENGTH = 40;

/** Strip diacritics → ASCII. */
export function normalizeAscii(name: string): string {
  return name
    .split("")
    .map((ch) => DIACRITICS_MAP[ch] ?? DIACRITICS_MAP[ch.toLowerCase()] ?? ch)
    .join("");
}

/** Segments for alias: camelCase split, ascii, lowercase, only a-z0-9. */
function toSegments(name: string): string[] {
  return normalizeAscii(name)
    // split camelCase boundaries (ScaffoldAgent -> scaffold_agent)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .split("_")
    .filter(Boolean)
    .filter((s) => !["agent", "view", "form", "library", "lib"].includes(s));
}

/** Truncate segment to its role cap. */
function capSegment(seg: string, cap: number): string {
  return seg.length <= cap ? seg : seg.slice(0, cap);
}

/**
 * Suggest an alias per the naming convention:
 *   <prefix>_<domain>_<object>_<target>
 * e.g. "Aktualizace pracovníků okruhů (save)" + agent → ag_akt_prac_okr_save
 */
export function suggestAlias(
  name: string,
  type: "agent" | "library" | "procedure" | "modular"
): string {
  const prefix = type === "library" ? "lib_" : "ag_";
  const raw = name.replace(/\.(lss|dxl)$/i, "");
  // Split on separators, drop the type words the template already knows.
  const segs = toSegments(raw);

  // First segment = domain/action (cap 6), middle = object (cap 6),
  // trailing variant tokens like save/idx stay whole.
  const capped = segs.map((s, i) => {
    const isLast = i === segs.length - 1;
    if (isLast && ["save", "mail", "ifx", "z", "do"].includes(s)) return s;
    return capSegment(s, i === 0 ? 6 : 6);
  });

  const alias = (prefix + capped.join("_")).slice(0, 40);
  return alias.replace(/_+$/, "");
}

export interface NoticeInfo {
  elementType: "Agent (standalone .lss)" | "Script Library (.lss)" | "Procedure (modular file)" | "Modular agent folder";
  name: string;
  alias: string;
  purpose?: string;
  targetDir?: string;
  files?: string[];
}

/**
 * Build the Designer registration notice.
 * `lang`: "cs" for /ls command notifications (user-facing),
 *         "en" for tool results (agent-facing).
 */
export function buildDesignerNotice(
  info: NoticeInfo,
  lang: "cs" | "en" = "en"
): string {
  const rule = "─".repeat(60);
  const purpose = info.purpose?.trim() || (lang === "cs" ? "(doplňte)" : "(fill in)");

  if (lang === "cs") {
    return [
      `📋 REGISTRACE DO DESIGNERU — ${info.name}`,
      rule,
      `Element:  ${info.elementType}`,
      `Název:    ${info.name}`,
      `Alias:    ${info.alias}`,
      `Účel:     ${purpose}`,
      "",
      "Postup vložení:",
      info.elementType === "Modular agent folder"
        ? "  1. Spusťte /ls pack " + (info.targetDir ?? "") + " (sestaví .lss a uklidí složku)"
        : "  1. Otevřete databázi → kategorie elementu → New",
      info.elementType === "Agent (standalone .lss)"
        ? `  2. Name: ${info.name}   Alias: ${info.alias}`
        : info.elementType === "Script Library (.lss)"
        ? `  2. Name: ${info.name}   Alias: ${info.alias}`
        : "  2. Alias nastavte dle references/naming-conventions.md",
      "  3. Runtime: On event ▸ Action menu selection, Target: Selected documents (agenty)",
      "  4. Vložte obsah .lss do (Options)/(Declarations) + sekce dle hlaviček",
      "  5. Uložte a přeložte: Ctrl+Shift+F9",
      "",
      `Popis elementu (do políčka Comment v Designeru):`,
      `  ${purpose}`,
      rule,
    ].join("\n");
  }

  return [
    `📋 DESIGNER REGISTRATION — ${info.name}`,
    rule,
    `Element:  ${info.elementType}`,
    `Name:     ${info.name}`,
    `Alias:    ${info.alias}`,
    `Purpose:  ${purpose}`,
    "",
    "Registration steps:",
    info.elementType === "Modular agent folder"
      ? `  1. Run /ls pack ${info.targetDir ?? ""} (compiles .lss and deletes the modular folder)`
      : "  1. Open the target database in Domino Designer → New <element type>",
    info.elementType === "Procedure (modular file)"
      ? "  2. The procedure joins the parent agent's modular folder — no separate Designer registration"
      : `  2. Name: ${info.name}   Alias: ${info.alias}`,
    info.elementType === "Agent (standalone .lss)" || info.elementType === "Modular agent folder"
      ? "  3. Runtime: On event ▸ Action menu selection, Target: Selected documents"
      : "  3. Script libraries: (Options)/(Declarations) per header",
    "  4. Paste the compiled .lss content into the matching sections",
    "  5. Save + recompile: Ctrl+Shift+F9",
    "",
    `Element description (Designer 'Comment' field — copy-paste):`,
    `  ${purpose}`,
    info.alias.startsWith("ag_")
      ? `Invocation from forms/buttons:\n  @Command([ToolsRunMacro]; "${info.alias}")`
      : "",
    `Convention reference: skills/lotusscript-modular/references/naming-conventions.md`,
    rule,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
