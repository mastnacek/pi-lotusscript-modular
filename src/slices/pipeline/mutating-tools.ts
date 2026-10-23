/**
 * Tools that mutate sources. A read-shaped result from one of these must never
 * be treated as "the agent read this file" (banner injection, edit detection).
 *
 * Kept apart from the guards slice: this is a non-guard constant shared by the
 * tool_result interceptors.
 */
export const MUTATING_TOOL_NAMES: ReadonlySet<string> = new Set([
  "edit",
  "write",
  "lotusscript_compile",
]);
