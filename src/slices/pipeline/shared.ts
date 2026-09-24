/**
 * Pipeline shared bits — event-shape mirror and tiny helpers used by the
 * split pipeline modules (tool-call, tool-result, settled, guidelines).
 */

import type { ToolResultEvent } from "@earendil-works/pi-coding-agent";

/** Structural mirror of the engine's ToolResultEventResult (content blocks come
 * straight from `event.content`, so the union stays compatible). */
export interface ToolResultEventResultShape {
  content?: ToolResultEvent["content"];
  details?: unknown;
  isError?: boolean;
  usage?: ToolResultEvent["usage"];
}

export function baseToolName(raw: string): string {
  return raw.includes("__") ? raw.split("__").pop()! : raw;
}
