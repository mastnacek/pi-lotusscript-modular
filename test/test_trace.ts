/**
 * Trace slice test — the visible skill trace.
 *
 * 1. Every kind renders icon + label + tag, in both languages.
 * 2. `ok: false` adds the warning marker (a checkpoint that needs attention).
 * 3. Dedupe keys ignore nothing that matters: same kind+detail+state collides,
 *    a different detail or state does not.
 * 4. The statusline tail is stable (fixed order, no duplicates) and empty when
 *    nothing has fired.
 * 5. Emitting respects the switch and de-duplicates per session.
 * 6. A checkpoint preserves the statusline state instead of claiming "clean".
 *
 * Run: npx tsx test/test_trace.ts
 */

import { emitTrace, traceKey, traceLine, traceTail, traceTag, type TraceKind } from "../src/slices/trace/index.js";
import { createTestState } from "./helpers.js";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (ok) console.log(`${label}: PASS`);
  else {
    failures++;
    console.log(`${label}: FAIL`);
  }
}

const KINDS: TraceKind[] = ["skill", "reference", "writing", "check", "versioning", "drift", "gate", "dod"];

// 1. every kind renders in both languages
for (const lang of ["cs", "en"]) {
  const all = KINDS.every((kind) => {
    const line = traceLine({ kind, detail: "x" }, lang);
    return line.includes("#") && line.includes("· x") && line.length > 8;
  });
  check(`1. all kinds render (${lang})`, all);
}

// 2. warning marker
check("2. ok:false adds the warning marker", traceLine({ kind: "versioning", ok: false }).includes("⚠️"));

// 3. dedupe key
check("3. same event collides", traceKey({ kind: "reference", detail: "a.md" }) === traceKey({ kind: "reference", detail: "a.md" }));
check("3b. different detail differs", traceKey({ kind: "reference", detail: "a.md" }) !== traceKey({ kind: "reference", detail: "b.md" }));
check("3c. warning differs from ok", traceKey({ kind: "drift" }) !== traceKey({ kind: "drift", ok: false }));

// 4. statusline tail
check("4. empty tail", traceTail([]) === "");
check("4b. stable order", traceTail([traceTag({ kind: "check" }), traceTag({ kind: "skill" })]) === ` ${traceTag({ kind: "skill" })}${traceTag({ kind: "check" })}`);
check("4c. no duplicates", traceTail(["🧩", "🧩"]) === " 🧩");

// 5. emit: dedupe + switch. The HUD is the only destination — no toast.
const state = createTestState();
const shown: string[] = [];
state.latestUiContext = {
  ...(state.latestUiContext as object),
  hasUI: true,
  mode: "tui",
  ui: { notify: (t: string) => shown.push(t) },
} as never;

emitTrace(state, { kind: "skill", detail: "lotusscript-modular" });
emitTrace(state, { kind: "skill", detail: "lotusscript-modular" });
check("5. emitted once per session", state.traceTags.length === 1);
check("5a. the checkpoint reaches the HUD, not the chat", shown.length === 0 && state.lastTrace?.label === "skill");

// A later checkpoint replaces the `last:` row but keeps its detail.
emitTrace(state, { kind: "versioning", ok: false });
check("5a2. last checkpoint is recorded with its state", state.lastTrace?.label === "verzování" && state.lastTrace?.ok === false);

state.config = { ...state.config, showSkillTrace: false };
emitTrace(state, { kind: "check", detail: "0 errors" });
check("5b. switch off silences it", state.traceTags.length === 2 && state.lastTrace?.label === "verzování");

// 6. A checkpoint must not overwrite the state the statusline already shows:
//    an LSP error the operator is looking at survives a trace line.
state.config = { ...state.config, showSkillTrace: true };
state.renderStatusline("error");
check("6. statusline records the state it rendered", state.statuslineState === "error");
emitTrace(state, { kind: "drift", detail: "lib_veba" });
check("6b. a trace checkpoint preserves the error state", state.statuslineState === "error");
check("6c. the checkpoint still reaches the HUD", state.lastTrace?.label === "drift knihovny");

if (failures > 0) {
  console.log(`\n${failures} trace test(s) FAILED`);
  process.exit(1);
}
console.log("\n=== All trace tests passed ===");
