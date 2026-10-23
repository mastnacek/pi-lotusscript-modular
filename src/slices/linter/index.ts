/**
 * Linter barrel — checker (pure lint functions) + modal component + prompt
 * helper. Implementation modules stay under the per-file line limit.
 */

export {
  findProcedures,
  lintLotusScriptFile,
} from "./checker.js";

export {
  ProcedureLimitComponent,
  type ProcedureReviewResult,
} from "./modal.js";

export { promptProcedureLineReview } from "./prompt-review.js";
