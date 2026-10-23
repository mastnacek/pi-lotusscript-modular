/**
 * Trace slice — the vocabulary of the visible skill trace.
 *
 * One checkpoint = one short line with an emoji, a label and a tag, e.g.
 *
 *   📄 reference · libraries-and-versioning.md  #skill
 *   🔖 checkpoint · version header not bumped  #checkpoint
 *
 * Why a fixed vocabulary: the trace is read at a glance during work. Free-form
 * messages become noise, so kinds are enumerated and every kind has exactly one
 * icon and one tag.
 *
 * Language: the trace is *UI* text, so labels follow `lang` (cs | en). They live
 * here instead of i18n because they are a closed, mechanical vocabulary of eight
 * kind names; the setting copy itself is in i18n.
 */

export type TraceKind =
  | "skill"
  | "reference"
  | "writing"
  | "check"
  | "versioning"
  | "drift"
  | "gate"
  | "dod";

export interface TraceEvent {
  kind: TraceKind;
  /** Short free text after the label (file name, count, verdict). */
  detail?: string;
  /** false renders a warning marker before the label. */
  ok?: boolean;
}

const ICON: Record<TraceKind, string> = {
  skill: "🧩",
  reference: "📄",
  writing: "📝",
  check: "🔍",
  versioning: "🔖",
  drift: "🧱",
  gate: "🚧",
  dod: "🏁",
};

const TAG: Record<TraceKind, string> = {
  skill: "#skill",
  reference: "#skill",
  writing: "#writing",
  check: "#check",
  versioning: "#checkpoint",
  drift: "#checkpoint",
  gate: "#gate",
  dod: "#checkpoint",
};

const LABELS: Record<string, Record<TraceKind, string>> = {
  cs: {
    skill: "skill",
    reference: "reference",
    writing: "celý soubor",
    check: "kontrola",
    versioning: "verzování",
    drift: "drift knihovny",
    gate: "KB gate",
    dod: "DoD",
  },
  en: {
    skill: "skill",
    reference: "reference",
    writing: "whole file",
    check: "check",
    versioning: "versioning",
    drift: "library drift",
    gate: "KB gate",
    dod: "DoD",
  },
};

function labelsFor(lang: string): Record<TraceKind, string> {
  return LABELS[lang] ?? LABELS.cs;
}

/** The chat-visible line for one checkpoint. */
export function traceLine(event: TraceEvent, lang = "cs"): string {
  const mark = event.ok === false ? "⚠️ " : "";
  const detail = event.detail ? ` · ${event.detail}` : "";
  return `${ICON[event.kind]} ${mark}${labelsFor(lang)[event.kind]}${detail}  ${TAG[event.kind]}`;
}

/** Dedupe key — the same checkpoint is shown once per session. */
export function traceKey(event: TraceEvent): string {
  return `${event.kind}:${event.detail ?? ""}:${event.ok === false ? "warn" : "ok"}`;
}

/** Short token accumulated in the statusline (icon only, stable order). */
export function traceTag(event: TraceEvent): string {
  return ICON[event.kind];
}

/** Stable, de-duplicated icon sequence for the statusline suffix. */
export function traceTail(tags: readonly string[]): string {
  const order: string[] = Object.values(ICON);
  const unique = order.filter((icon) => tags.includes(icon));
  return unique.length > 0 ? ` ${unique.join("")}` : "";
}
