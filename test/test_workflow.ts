/**
 * Whole-file workflow test runner.
 *
 * Phases live in test/phases/*.ts — each stays under the plugin's own
 * per-file line limit (hard 400 / soft 300). This file only orchestrates
 * phase execution order and final cleanup.
 */

import { cleanupTestDir } from "./helpers.js";
import { phaseLinter } from "./phases/phase-linter.js";
import { phaseScorecard } from "./phases/phase-scorecard.js";
import { phasePipeline } from "./phases/phase-pipeline.js";
import { phaseCommands } from "./phases/phase-commands.js";
import { phaseTools } from "./phases/phase-tools.js";
import { phaseExtension } from "./phases/phase-extension.js";

async function runTest(): Promise<void> {
  console.log("=== LotusScript whole-file workflow (VSA layout) ===");

  await phaseLinter();
  await phaseScorecard();
  await phasePipeline();
  await phaseCommands();
  await phaseTools();
  await phaseExtension();

  console.log("=== All whole-file workflow tests passed ===");
}

runTest()
  .then(() => cleanupTestDir())
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
