/**
 * VSA Modular Workflow test runner.
 *
 * Phases live in test/phases/*.ts — each stays under the plugin's own
 * per-file line limit (hard 400 / soft 300). This file only orchestrates
 * phase execution order and final cleanup.
 */

import { cleanupTestDir } from "./helpers.js";
import { phase1To4 } from "./phases/phase1.js";
import { phase5 } from "./phases/phase5.js";
import { phase6 } from "./phases/phase6.js";
import { phase7 } from "./phases/phase7.js";
import { phase8 } from "./phases/phase8.js";
import { phase9 } from "./phases/phase9.js";
import { phase10 } from "./phases/phase10.js";
import { phase11a } from "./phases/phase11.js";
import { phase12a, phase12b } from "./phases/phase12.js";
import { phase13a, phase13b } from "./phases/phase13.js";
import { phase14 } from "./phases/phase14.js";

async function runTest(): Promise<void> {
  console.log("=== Testing LotusScript Modular Standalone Package (VSA Layout) ===");

  await phase1To4();
  await phase5();
  await phase6();
  await phase7();

  // ScoreAgent root created by phase7 feeds the guards phase (35–39).
  const scoreDir = `${process.cwd().replace(/\\/g, "/")}/temp_modular_test/ScoreAgent`;
  await phase8(scoreDir);

  await phase9();
  await phase10();

  const jev = await phase11a();
  const guardFixture = await phase12a(jev.cleanItems, jev.scGood, jev.scWithJev);
  await phase12b(guardFixture, { newAnalysis: jev.newAnalysis, oldAnalysis: jev.oldAnalysis, parsedJev: jev.parsedJev, folderSummary: jev.folderSummary });

  const scaffoldOutDir = await phase13a();
  await phase13b(scaffoldOutDir);

  await phase14();

  // Cleanup
  cleanupTestDir();
  console.log("=== All VSA Modular Workflow Tests Passed! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
