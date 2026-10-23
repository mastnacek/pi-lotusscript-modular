/**
 * Linter barrel — checker (pure lint functions).
 *
 * The over-limit approval modal (ProcedureLimitComponent, InstructionsInput,
 * promptProcedureLineReview) was deleted together with the procedure-length
 * rule; only the purpose-comment check remains.
 */

export {
  findProcedures,
  lintLotusScriptFile,
} from "./checker.js";
