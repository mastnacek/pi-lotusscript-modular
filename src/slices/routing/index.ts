/**
 * Routing gate — decides whether a user request needs the LotusScript modular
 * workflow.
 *
 * Deliberately three-tier so a model is never the default router:
 *
 *   Tier 0  deterministic, free, always first. A `.lss` path, a `/ls` command or
 *           an explicit skill mention already answers the question.
 *   Tier 1  one Jev Noul, only when Tier 0 is silent. Measured $0.0000366 per
 *           call; 500 chars of prompt, never the whole conversation.
 *   Cache   same prompt + same model = one paid call, then free forever.
 *
 * Jev never vetoes Tier 0 and never blocks the request: a timeout, a missing key
 * or an empty answer all resolve to "no routing hint", which is the pre-existing
 * behaviour.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { askJevNoul, routingCacheKey } from "../../shared/jev-client.js";
import type { ModularConfig } from "../../shared/types.js";

/** Free, exact signals: any hit means the workflow is obviously relevant. */
const DETERMINISTIC_SIGNALS: readonly RegExp[] = [
  /\.lss\b/i,
  /\.dxl\b/i,
  /\/ls\b/,
  /\/skill:lotusscript-modular\b/i,
  // No trailing \b on purpose: Czech inflection ("LotusScriptu", "LotusScriptem")
  // is the normal shape of these prompts.
  /\bLotusScript/i,
  /\bNotes\s*\/?\s*Domino\b/i,
];

export type Tier0Hit = string | null;

export function deterministicTier0(prompt: string): Tier0Hit {
  for (const signal of DETERMINISTIC_SIGNALS) {
    if (signal.test(prompt)) return signal.source;
  }
  return null;
}

const CACHE_LIMIT = 50;
const cache = new Map<string, { value: number; model: string }>();

function cacheGet(key: string): { value: number; model: string } | undefined {
  const hit = cache.get(key);
  if (hit) {
    // refresh recency
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, entry: { value: number; model: string }): void {
  cache.set(key, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Test seam — drops memoized decisions. */
export function clearRoutingCache(): void {
  cache.clear();
}

export interface RoutingVerdict {
  /** "deterministic" | "jev" | "cached" | "skipped" */
  source: "deterministic" | "jev" | "cached" | "skipped";
  /** 0..1, or null when no decision was reached. */
  value: number | null;
  model?: string;
  /** Guideline to inject, or null when nothing should be injected. */
  guideline: string | null;
}

const INSTRUCTIONS =
  "Does this request require working with IBM Notes/Domino LotusScript agents — " +
  "reading, writing, reviewing, scaffolding, or compiling .lss/.dxl code, or " +
  "searching a LotusScript knowledge base? Answer no for unrelated work.";

const THRESHOLD = 0.6;

/**
 * Runs the gate. Never throws: any failure resolves to a "skipped" verdict.
 */
export async function routeRequest(
  prompt: string,
  config: ModularConfig,
  ctx?: ExtensionContext,
  deps: {
    ask?: typeof askJevNoul;
    key?: string;
  } = {}
): Promise<RoutingVerdict> {
  if (!config.useJevRouting) {
    return { source: "skipped", value: null, guideline: null };
  }

  // Tier 0 — free, and a Jev answer is never allowed to contradict it.
  const hit = deterministicTier0(prompt);
  if (hit) {
    return { source: "deterministic", value: 1, model: "tier0", guideline: null };
  }

  // Tier 1 — one memoized Noul on a bounded slice of the prompt.
  const model = config.jevModel;
  const key = deps.key ?? routingCacheKey(prompt, model);
  const memo = cacheGet(key);
  if (memo) {
    return finish("cached", memo);
  }

  const ask = deps.ask ?? askJevNoul;
  let answer: { value: number; model: string } | null = null;
  try {
    // 500 chars: enough to judge the request, cheap enough to run on every turn.
    answer = await ask(prompt.slice(0, 500), INSTRUCTIONS, {
      apiKey: config.openrouterApiKey,
      jevModel: model,
      timeoutMs: 7000,
      ctx,
    });
  } catch {
    answer = null;
  }

  if (!answer) {
    return { source: "skipped", value: null, guideline: null };
  }
  cacheSet(key, answer);
  return finish("jev", answer);
}

function finish(
  source: RoutingVerdict["source"],
  answer: { value: number; model: string }
): RoutingVerdict {
  const relevant = answer.value >= THRESHOLD;
  return {
    source,
    value: answer.value,
    model: answer.model,
    guideline: relevant
      ? [
          `REQUEST GATE (Jev ${answer.model}, noul=${answer.value.toFixed(2)}): this request looks like IBM Notes/Domino LotusScript work.`,
          "Use the modular workflow: /ls status to see config, lotusscript_gotchas to check traps, and query the lotus-notes knowledge base before writing LotusScript API calls.",
        ].join(" ")
      : null,
  };
}
