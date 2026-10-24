/**
 * HUD panel tests: the pure, colour-tagged layout, the progress bars, the
 * spinner frames and the repaint timer that drives them.
 *
 * The visual contract matters because the HUD is the plugin's ONLY live
 * surface (AGENTS.md, "one surface per fact"): a layout that silently drops a
 * fact, a bar that reads "met" when it is not, or a spinner that never advances
 * is a behavioural regression, not a cosmetic one.
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import {
  bar,
  createTelemetry,
  currentSpinnerFrame,
  hudLines,
  hudSegments,
  LotusHudComponent,
  SPINNER_FRAMES,
  stopHudAnimation,
  type HudView,
} from "../src/shared/state-hud.js";
import { DEFAULT_CONFIG } from "../src/shared/config.js";

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const cs = { ...DEFAULT_CONFIG, lang: "cs" as const };
const en = { ...DEFAULT_CONFIG, lang: "en" as const };

function view(over: Partial<HudView> = {}): HudView {
  return {
    telemetry: createTelemetry(),
    state: "idle",
    score: null,
    kbQueries: 0,
    kbRequired: 3,
    traceTail: "",
    lastTrace: null,
    ...over,
  };
}

// 1. Bars: progress must never overstate the requirement.
check("bar: 0/3 is empty", bar(0, 3) === "▱▱▱", bar(0, 3));
check("bar: 1/3 floors to one cell", bar(1, 3) === "▰▱▱", bar(1, 3));
check("bar: 2/3 is two cells", bar(2, 3) === "▰▰▱", bar(2, 3));
check("bar: 3/3 is full", bar(3, 3) === "▰▰▰", bar(3, 3));
check("bar: over-delivery stays full, not wider", bar(9, 3) === "▰▰▰", bar(9, 3));
check("bar: no requirement draws nothing", bar(0, 0) === "" && bar(3, 0) === "");
check("bar: default width is 5 cells", visibleWidth(bar(10, 40)) === 5, bar(10, 40));
check("bar: an oversized request is capped at 8 cells", visibleWidth(bar(10, 40, 20)) === 8, bar(10, 40, 20));

// 2. Colour tags: every non-glyph fact carries a role, so the panel is not a
//    single grey block (the regression this test exists for).
const clean = view({
  state: "clean",
  score: { score: 4, max: 4 },
  kbQueries: 3,
  telemetry: { ...createTelemetry(), lastLspOk: true, lspLane: "ready" },
});
const cleanSegs = hudSegments(clean, cs);
const colors = new Set(cleanSegs.flat().map((s) => s.color));
check("segments: a clean run uses success + accent + muted accents", colors.has("success") && colors.has("accent"), [...colors]);
check("segments: LSP verdict is green on success", cleanSegs[0]!.some((s) => s.text === "🌸" && s.color === "success"));
check("segments: score bar is green when the score is full", cleanSegs[0]!.some((s) => s.text.startsWith("▰▰▰▰") && s.color === "success"));

const failed = view({ state: "error", telemetry: { ...createTelemetry(), lastLspOk: false, kbGateBlocks: 1 } });
const failedSegs = hudSegments(failed, cs);
check("segments: LSP verdict is red on failure", failedSegs[0]!.some((s) => s.text === "🥀" && s.color === "error"));
check("segments: the KB segment carries the botanical marker", cleanSegs[0]!.some((s) => s.text === "🌿 " && s.color === "muted"));
check("segments: a blocked gate turns the bolt red", failedSegs[2]!.some((s) => s.text === "⚡ " && s.color === "error"));
check("segments: a blocked gate counts in red", failedSegs[2]!.some((s) => s.text === "1 blokováno" && s.color === "error"));

const idleGates = hudSegments(view(), cs);
check("segments: an untouched gate line is green", idleGates[2]!.some((s) => s.text === "⚡ " && s.color === "success"));

// 3. Spinner: only a running check animates, and the frame argument drives it.
check(
  "spinner: a checking run shows a braille frame in the LSP cell",
  hudSegments(view({ state: "checking" }), cs, 0)[0]!.some((s) => s.text === SPINNER_FRAMES[0] && s.color === "accent")
);
check(
  "spinner: frame 4 shows frame 4's glyph",
  hudSegments(view({ state: "checking" }), cs, 4)[0]!.some((s) => s.text === SPINNER_FRAMES[4])
);
check(
  "spinner: an idle run shows the verdict, never a frame",
  !hudSegments(view(), cs, 3)[0]!.some((s) => (SPINNER_FRAMES as readonly string[]).includes(s.text))
);
check(
  "spinner: frames are distinct glyphs",
  new Set(SPINNER_FRAMES).size === SPINNER_FRAMES.length
);

// 4. i18n: the same layout renders in both locales (fragments, not whole lines).
const enCheck = hudLines(view({ state: "checking", kbQueries: 1 }), en, 2).join(" ");
check("i18n en: checking run reads in English", enCheck.includes("checking…") && enCheck.includes("LSP ⠹") && enCheck.includes("KB"), enCheck);
const csCheck = hudLines(view({ state: "checking", kbQueries: 1 }), cs, 2).join(" ");
check("i18n cs: checking run reads in Czech", csCheck.includes("kontroluji…") && csCheck.includes("brány"), csCheck);

// 5. Width safety: every rendered line must fit the width it was given.
const fakeTheme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
function component(v: HudView, tui?: unknown) {
  return new LotusHudComponent(fakeTheme as never, () => v, () => cs, tui);
}
for (const width of [12, 24, 40, 80]) {
  const rendered = component(view({ state: "clean", score: { score: 2, max: 4 }, kbQueries: 1, traceTail: "🧩📄", lastTrace: { label: "kontrola", detail: "ag_x.lss", ok: false } })).render(width);
  check(
    `width ${width}: every line fits`,
    rendered.every((l) => visibleWidth(l) <= width),
    rendered.map((l) => visibleWidth(l))
  );
}

// 6. Animation driver: a checking run repaints on its own; nothing else does.
const frames: string[] = [];
const fakeTui = { requestRender: () => frames.push(String(currentSpinnerFrame())) };
const stopRequests = { count: 0 };
const idleTui = { requestRender: () => stopRequests.count++ };

async function animationChecks(): Promise<void> {
  const spinning = component(view({ state: "checking" }), fakeTui);
  await new Promise((r) => setTimeout(r, 260));
  check("animation: a running check repaints repeatedly", frames.length >= 2, frames.length);
  check("animation: frames advance past the first glyph", new Set(frames).size >= 2, [...new Set(frames)]);
  check("animation: the component still renders the spinner", spinning.render(60)[0]!.includes("LSP "));

  spinning.dispose();
  const afterDispose = frames.length;
  await new Promise((r) => setTimeout(r, 200));
  check("animation: dispose stops the repaint timer", frames.length === afterDispose, frames.length - afterDispose);

  const idle = component(view({ state: "clean" }), idleTui);
  await new Promise((r) => setTimeout(r, 200));
  check("animation: a settled run never repaints", stopRequests.count === 0, stopRequests.count);
  idle.dispose();
  stopHudAnimation();
}

await animationChecks();

if (failures > 0) {
  console.log(`\n${failures} HUD test(s) failed`);
  process.exit(1);
}
console.log("\n=== All HUD tests passed ===");
