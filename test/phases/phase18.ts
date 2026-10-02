/**
 * Phase 18: Jev request-routing gate (89a–89f).
 *
 * The gate exists so a model is never the default router: Tier 0 is free and
 * runs first, the memoized Noul only fires when Tier 0 is silent, and every
 * failure resolves to "no hint" rather than to a blocked user request.
 */

import {
  clearRoutingCache,
  deterministicTier0,
  routeRequest,
} from "../../src/slices/routing/index.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import type { ModularConfig } from "../../src/shared/types.js";

function report(num: string, label: string, ok: boolean): void {
  console.log(`${num}. ${label}:`, ok ? "PASS" : "FAIL");
  if (!ok) throw new Error(`Phase 18 check ${num} failed: ${label}`);
}

/** A fake model that records its calls and returns a scripted answer. */
function fakeAsk(value: number | null) {
  const calls: string[] = [];
  const ask = async (state: string): Promise<{ value: number; model: string } | null> => {
    calls.push(state);
    if (value === null) return null;
    return { value, model: "fake-jev" };
  };
  return { ask, calls };
}

const ON: ModularConfig = { ...DEFAULT_CONFIG, useJevRouting: true };
const OFF: ModularConfig = { ...DEFAULT_CONFIG, useJevRouting: false };

export async function phase18(): Promise<void> {
  clearRoutingCache();

  // 89a: off by default — the gate must not touch the model at all
  const offModel = fakeAsk(0.9);
  const off = await routeRequest("what is the weather", OFF, undefined, { ask: offModel.ask });
  report(
    "89a",
    "useJevRouting:false skips the gate and never calls the model",
    off.source === "skipped" && off.guideline === null && offModel.calls.length === 0
  );

  // 89b: Tier 0 — a deterministic signal wins and the model is never consulted
  const tier0 = fakeAsk(0.0);
  const deterministic = await routeRequest(
    "refactor D:/tmp/Agent.lss please",
    ON,
    undefined,
    { ask: tier0.ask }
  );
  report(
    "89b",
    "a .lss mention is answered by Tier 0 for free; Jev is never asked",
    deterministic.source === "deterministic" && tier0.calls.length === 0
  );

  // 89c: silent Tier 0 + confident Jev -> guideline injected
  clearRoutingCache();
  const high = fakeAsk(0.82);
  const yes = await routeRequest("posli mi nejlepsi recept na kolacku", ON, undefined, { ask: high.ask });
  report(
    "89c",
    "silent Tier 0 + noul>=0.6 injects one routing guideline",
    yes.source === "jev" && yes.guideline !== null && high.calls.length === 1
  );

  // 89d: silent Tier 0 + unconfident Jev -> no guideline
  clearRoutingCache();
  const low = fakeAsk(0.21);
  const no = await routeRequest("posli mi nejlepsi recept na kolacku", ON, undefined, { ask: low.ask });
  report(
    "89d",
    "silent Tier 0 + noul<0.6 injects nothing",
    no.source === "jev" && no.guideline === null
  );

  // 89e: fail open — a dead model must not block or throw
  clearRoutingCache();
  const dead = fakeAsk(null);
  const failed = await routeRequest("co kdyz model nebezi", ON, undefined, { ask: dead.ask });
  let threw = false;
  try {
    await routeRequest("dalsi pokus", ON, undefined, {
      ask: async () => {
        throw new Error("network down");
      },
    });
  } catch {
    threw = true;
  }
  report(
    "89e",
    "an unreachable or throwing model yields 'skipped' and never throws",
    failed.source === "skipped" && failed.guideline === null && threw === false
  );

  // 89f: cache — the same prompt pays once
  clearRoutingCache();
  const cacheModel = fakeAsk(0.75);
  const first = await routeRequest("identicky pozadavek", ON, undefined, { ask: cacheModel.ask });
  const second = await routeRequest("identicky pozadavek", ON, undefined, { ask: cacheModel.ask });
  report(
    "89f",
    "an identical prompt is answered once and served from cache after",
    first.source === "jev" && second.source === "cached" && cacheModel.calls.length === 1
  );

  // deterministicTier0 spot checks — the free signals must stay free
  const signalsOk = [
    deterministicTier0("uprav SluzebniEmail.lss") !== null,
    deterministicTier0("pust mi /ls status") !== null,
    deterministicTier0("jak se delaji agenti v LotusScriptu") !== null,
    deterministicTier0("nastav mi pocasi") === null,
  ].every(Boolean);
  report("89g", "Tier 0 signals fire on .lss, /ls and LotusScript, stay silent otherwise", signalsOk);
}