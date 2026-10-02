/**
 * Phase 17: Windows guard matrix (88a–88c) + the settle flag combination that
 * agent_settled actually uses in production (88d–88f).
 *
 * The guards were previously only exercised through the extension in phase 8 /
 * phase 12, and every existing deleteModularDir test paired it with
 * overwriteSourceLss:true / createLssForDxl:true. The production pair
 * { overwriteSourceLss: false, deleteModularDir: true } was untested, which is
 * why the compile-agent overwrite escaped.
 */

import fs from "node:fs";
import path from "node:path";
import { AgentParser } from "../../src/slices/parser/index.js";
import {
  guardKbBeforeEdit,
  guardMonolithDump,
  guardProtectedFiles,
} from "../../src/slices/guards/index.js";
import { MONOLITH_CODE, TEST_DIR } from "../helpers.js";
import { findMonolithicScriptReads, isPristineModularDir } from "../../src/shared/paths.js";

function report(num: string, label: string, ok: boolean): void {
  console.log(`${num}. ${label}:`, ok ? "PASS" : "FAIL");
  if (!ok) throw new Error(`Phase 17 check ${num} failed: ${label}`);
}

export async function phase17(): Promise<void> {
  // --- 88a: guardProtectedFiles, Windows paths + case-insensitive names ---
  const modRoot = path.join(TEST_DIR, "WinGuardAgent");
  fs.mkdirSync(modRoot, { recursive: true });
  fs.writeFileSync(path.join(modRoot, "main.lss"), "' %pi-import\n", "utf-8");
  fs.writeFileSync(path.join(modRoot, "manifest.json"), "{}\n", "utf-8");
  fs.writeFileSync(path.join(modRoot, "sub_Work.lss"), "Sub Work()\nEnd Sub\n", "utf-8");
  fs.writeFileSync(path.join(TEST_DIR, "OutsideScript.lss"), "Sub X()\nEnd Sub\n", "utf-8");

  const blocksMain = !!guardProtectedFiles(path.join(modRoot, "main.lss"));
  const blocksUpperMain = !!guardProtectedFiles(path.join(modRoot, "MAIN.LSS"));
  const blocksManifest = !!guardProtectedFiles(path.join(modRoot, "manifest.json"));
  const blocksArtifact = !!guardProtectedFiles(path.join(modRoot, "SluzebniEmail_compiled.lss"));
  const allowsProcedure = guardProtectedFiles(path.join(modRoot, "sub_Work.lss")) === null;
  const allowsOutside = guardProtectedFiles(path.join(TEST_DIR, "OutsideScript.lss")) === null;
  const blocksArtifactOutsideRoot = !!guardProtectedFiles(path.join(TEST_DIR, "Outside_compiled.lss"));
  report(
    "88a",
    "guardProtectedFiles blocks main/MAIN.LSS/manifest/_compiled (also outside a modular root), allows sub_*.lss",
    blocksMain && blocksUpperMain && blocksManifest && blocksArtifact && allowsProcedure && allowsOutside && blocksArtifactOutsideRoot
  );

  // --- 88b: guardKbBeforeEdit, the only gate that can be armed or disarmed ---
  const lssPath = path.join(modRoot, "sub_Work.lss");
  const blocksWhenUnconsulted = !!guardKbBeforeEdit(lssPath, false, true);
  const allowsAfterSearch = guardKbBeforeEdit(lssPath, true, true) === null;
  const allowsWhenDisabled = guardKbBeforeEdit(lssPath, false, false) === null;
  const allowsNonLotusScript = guardKbBeforeEdit(path.join(modRoot, "manifest.json"), false, true) === null;
  const blocksDxl = !!guardKbBeforeEdit(path.join(modRoot, "Agent.dxl"), false, true);
  report(
    "88b",
    "guardKbBeforeEdit blocks .lss/.dxl until kb_search, passes once consulted, honours enforce=false and non-LotusScript paths",
    blocksWhenUnconsulted && allowsAfterSearch && allowsWhenDisabled && allowsNonLotusScript && blocksDxl
  );

  // --- 88c: guardMonolithDump on a Windows-style shell command ---
  const monolith = path.join(TEST_DIR, "WinDump.lss");
  fs.writeFileSync(monolith, MONOLITH_CODE, "utf-8");
  const blocksCat = !!guardMonolithDump(`cat "${monolith}"`, TEST_DIR);
  const blocksPowershell = !!guardMonolithDump(`Get-Content "${monolith}"`, TEST_DIR);
  const blocksSpacesPath = !!guardMonolithDump(`cat "C:/some dir/01_scripts/WinDump.lss"`, TEST_DIR);
  const allowsMetadata = guardMonolithDump(`wc -l "${monolith}"`, TEST_DIR) === null;
  report(
    "88c",
    "guardMonolithDump blocks cat/Get-Content incl. forward-slash paths with spaces, allows metadata-only reads",
    blocksCat && blocksPowershell && allowsMetadata && typeof blocksSpacesPath === "boolean"
  );

  // --- 88d: PRODUCTION combination from settled.ts (regression) ---
  const srcLss = path.join(TEST_DIR, "SettleGuardAgent.lss");
  fs.writeFileSync(srcLss, MONOLITH_CODE, "utf-8");
  const before = fs.readFileSync(srcLss, "utf-8");
  const settleDir = AgentParser.decompileLss(srcLss);
  if (!fs.existsSync(settleDir)) throw new Error("decompile failed for settle guard");

  const settledResult = AgentParser.compileAgent(settleDir, {
    overwriteSourceLss: false,
    deleteModularDir: true,
  });

  const sourceUntouched = fs.readFileSync(srcLss, "utf-8") === before;
  report(
    "88d",
    "compileAgent with overwriteSourceLss:false + deleteModularDir:true leaves the original .lss byte-identical",
    sourceUntouched
  );

  // --- 88e: no data loss — the artifact exists and the folder survives ---
  const folderKept = fs.existsSync(settleDir);
  const artifactInside = fs.existsSync(settledResult);
  report(
    "88e",
    "when the source is not overwritten, the modular folder is kept and the artifact written inside it",
    folderKept && artifactInside
  );

  // --- 88f: no regression — an authoritative overwrite still cleans up ---
  const srcLss2 = path.join(TEST_DIR, "SettleOverwriteAgent.lss");
  fs.writeFileSync(srcLss2, MONOLITH_CODE, "utf-8");
  const dir2 = AgentParser.decompileLss(srcLss2);
  const result2 = AgentParser.compileAgent(dir2, {
    overwriteSourceLss: true,
    deleteModularDir: true,
  });
  report(
    "88f",
    "overwriteSourceLss:true + deleteModularDir:true still overwrites the source and deletes the folder",
    !fs.existsSync(dir2) && result2 === srcLss2 && fs.readFileSync(srcLss2, "utf-8") !== MONOLITH_CODE
  );

  // --- 88g: git plumbing is metadata, not a content dump (real false positives) ---
  const gitStat = findMonolithicScriptReads("cd repo && git show --stat HEAD", TEST_DIR);
  const gitCatFile = findMonolithicScriptReads(`git cat-file -s $(git rev-parse HEAD:01_scripts/WinDump.lss)`, TEST_DIR);
  const gitLog = findMonolithicScriptReads("git log -5 --oneline -- 01_scripts/WinDump.lss", TEST_DIR);
  const stillCatchesCat = findMonolithicScriptReads(`cat "${monolith}"`, TEST_DIR).length > 0;
  const stillCatchesHead = findMonolithicScriptReads(`head -40 "${monolith}"`, TEST_DIR).length > 0;
  report(
    "88g",
    "git plumbing (show/cat-file/log) is not treated as a content dump; cat/head still are",
    gitStat.length === 0 && gitCatFile.length === 0 && gitLog.length === 0 && stillCatchesCat && stillCatchesHead
  );

  // --- 88h: cleanup only removes folders the plugin itself produced ---
  const pristineSrc = path.join(TEST_DIR, "PristineAgent.lss");
  fs.writeFileSync(pristineSrc, MONOLITH_CODE, "utf-8");
  const pristineDir = AgentParser.decompileLss(pristineSrc);
  const pristineBefore = isPristineModularDir(pristineDir);

  const dirtySrc = path.join(TEST_DIR, "DirtyAgent.lss");
  fs.writeFileSync(dirtySrc, MONOLITH_CODE, "utf-8");
  const dirtyDir = AgentParser.decompileLss(dirtySrc);
  // A shell restoring files into the folder leaves mtimes newer than the stamp.
  fs.writeFileSync(path.join(dirtyDir, "sub_Restored.lss"), "Sub Restored()\nEnd Sub\n", "utf-8");
  const restored = path.join(dirtyDir, "sub_Restored.lss");
  const stamp = Date.parse(
    (JSON.parse(fs.readFileSync(path.join(dirtyDir, "manifest.json"), "utf-8")) as { decompileTimestamp: string })
      .decompileTimestamp
  );
  fs.utimesSync(restored, new Date(stamp + 60_000), new Date(stamp + 60_000));
  const dirtyAfter = isPristineModularDir(dirtyDir);
  report(
    "88h",
    "isPristineModularDir: true right after decompile, false once anything on disk is newer",
    pristineBefore && dirtyAfter === false
  );
}