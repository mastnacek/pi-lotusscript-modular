/**
 * Phase: project detection — bounded scan, entry-skill hint and the setting
 * that gates it. The scan must stay shallow, never follow dependency/VCS/plugin
 * directories, and never be trusted as a deep repository walk.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildProjectSkillGuideline,
  buildReadSkillNotice,
  createProjectDetector,
  detectLotusScriptProject,
  getEntrySkillPath,
  hasEntrySkill,
  readEntrySkillBody,
  skillChoiceOutcome,
  skillPromptDecision,
  wrapSkillMessage,
  discoverSkillResources,
  LotusSkillPromptComponent,
} from "../../src/slices/project/index.js";
import { stringsFor } from "../../src/shared/i18n.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { buildPromptGuidelines } from "../../src/slices/pipeline/guidelines.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import * as paths from "../../src/shared/paths.js";
import type { ProjectFingerprint } from "../../src/shared/types.js";
import { ensureTestDir, TEST_DIR } from "../helpers.js";

function workDir(name: string): string {
  const dir = path.join(TEST_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(dir: string, rel: string, body = "x"): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
}

function posix(p?: string): string {
  return (p ?? "").split(path.sep).join("/");
}

function assert(label: string, ok: boolean, detail = ""): void {
  console.log(`${label}:`, ok ? "PASS" : "FAIL");
  if (!ok) throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
}

export async function phaseProject(): Promise<void> {
  ensureTestDir();

  // 1. A directory with no Domino files is not a LotusScript project.
  const empty = workDir("proj-empty");
  const none = detectLotusScriptProject(empty);
  assert("1. empty directory → no evidence", !none.hasLotusScript && !none.truncated, JSON.stringify(none));

  // 2. Evidence next to the root is found, reported relatively, and typed.
  const flat = workDir("proj-flat");
  touch(flat, "Agent.lss");
  const flatFp = detectLotusScriptProject(flat);
  assert(
    "2. root-level .lss → lss evidence with relative sample",
    flatFp.hasLotusScript && flatFp.kind === "lss" && posix(flatFp.sampleFile) === "Agent.lss" && path.isAbsolute(flatFp.root),
    JSON.stringify(flatFp)
  );

  // 3. Nested sources are found one level down (the usual 01_scripts/ layout).
  const nested = workDir("proj-nested");
  touch(nested, path.join("01_scripts", "ExportDXL.lss"));
  const nestedFp = detectLotusScriptProject(nested);
  assert(
    "3. nested .lss found at depth 1",
    nestedFp.hasLotusScript && posix(nestedFp.sampleFile) === "01_scripts/ExportDXL.lss",
    JSON.stringify(nestedFp)
  );

  // 4. Formula, DXL and loose .ls dumps all count as evidence, each with its kind.
  const kinds: Array<[string, string, string]> = [
    ["proj-fl", "button.fl", "formula"],
    ["proj-dxl", "Form.dxl", "dxl"],
    ["proj-ls", "Legacy.ls", "loose"],
  ];
  for (const [dirName, fileName, kind] of kinds) {
    const dir = workDir(dirName);
    touch(dir, fileName);
    const fp = detectLotusScriptProject(dir);
    assert(`4. ${fileName} → ${kind} evidence`, fp.hasLotusScript && fp.kind === kind, JSON.stringify(fp));
  }

  // 5. Dependency, VCS and plugin directories are never walked.
  const noisy = workDir("proj-noisy");
  touch(noisy, path.join("node_modules", "pkg", "Vendored.lss"));
  touch(noisy, path.join(".pi", "tmp", "fixture.lss"));
  touch(noisy, path.join(".git", "hook.lss"));
  touch(noisy, path.join("src", "notes.md"));
  const noisyFp = detectLotusScriptProject(noisy);
  assert("5. node_modules/.pi/.git sources are ignored", !noisyFp.hasLotusScript, JSON.stringify(noisyFp));

  // 6. Depth is bounded: three levels down is outside the default reach.
  const deep = workDir("proj-deep");
  touch(deep, path.join("a", "b", "c", "Deep.lss"));
  const shallowScan = detectLotusScriptProject(deep);
  const deepScan = detectLotusScriptProject(deep, { maxDepth: 3 });
  assert(
    "6. default depth stops at 2 levels; explicit maxDepth reaches 3",
    !shallowScan.hasLotusScript && deepScan.hasLotusScript && posix(deepScan.sampleFile) === "a/b/c/Deep.lss",
    JSON.stringify({ shallowScan, deepScan })
  );

  // 7. The entry cap stops the scan and records truncation (no silent "clean").
  const big = workDir("proj-big");
  for (let i = 0; i < 5; i++) touch(big, `file${i}.txt`);
  const capped = detectLotusScriptProject(big, { maxEntries: 1 });
  assert("7. entry cap → truncated, not evidence", capped.truncated && !capped.hasLotusScript, JSON.stringify(capped));

  // 8. The detector memoizes per root and re-scans only after reset().
  const cached = workDir("proj-cached");
  const detector = createProjectDetector();
  const before = detector.detect(cached);
  touch(cached, "New.lss");
  const stillCached = detector.detect(cached);
  detector.reset();
  const afterReset = detector.detect(cached);
  assert(
    "8. detector caches until reset()",
    !before.hasLotusScript && !stillCached.hasLotusScript && afterReset.hasLotusScript,
    JSON.stringify({ before, stillCached, afterReset })
  );

  // 9. Path protocol: .ls is evidence only, never a whole-file script.
  const okPaths =
    paths.isLotusScriptSource("A.lss") &&
    !paths.isLotusScriptSource("Legacy.ls") &&
    paths.isLooseScript("Legacy.ls") &&
    paths.isFormulaSource("button.fl") &&
    paths.isDxlSource("Form.dxl") &&
    !paths.isLotusScriptOrDxl("button.fl");
  assert("9. evidence extensions stay out of the compile/gate protocol", okPaths);

  // 10. The shipped skill resolves, so the hint can never point at a dead path.
  const skillPath = getEntrySkillPath();
  assert(
    "10. bundled entry skill exists",
    hasEntrySkill() && posix(skillPath).endsWith("skills/lotusscript-modular/SKILL.md"),
    skillPath
  );

  // 11. Hint builders: no evidence → no guideline; evidence → sample + skill path.
  const fingerprint: ProjectFingerprint = {
    root: nested,
    hasLotusScript: true,
    kind: "lss",
    sampleFile: "01_scripts/ExportDXL.lss",
    scanned: 4,
    truncated: false,
  };
  const guideline = buildProjectSkillGuideline(fingerprint, skillPath);
  const quiet = buildProjectSkillGuideline({ ...fingerprint, hasLotusScript: false, kind: undefined, sampleFile: undefined }, skillPath);
  assert(
    "11. guideline carries the sample file and the skill path",
    quiet === null &&
      Boolean(guideline && guideline.includes("01_scripts/ExportDXL.lss") && guideline.includes(skillPath) && /read it before/i.test(guideline)),
    String(guideline)
  );
  const notice = buildReadSkillNotice(skillPath);
  assert(
    "12. read notice points at the skill before editing",
    notice.includes("ENTRY SKILL") && notice.includes(skillPath) && /before editing/i.test(notice),
    notice
  );

  // 12. The setting gates the system-prompt line (deps stub: only the two used fields).
  const deps = {
    projectSkillGuideline: () => "PROJECT SKILL LINE",
    buildGradingRubric: () => "RUBRIC",
  } as unknown as Parameters<typeof buildPromptGuidelines>[1];
  const on = buildPromptGuidelines({ ...DEFAULT_CONFIG, injectProjectSkillHint: true }, deps);
  const off = buildPromptGuidelines({ ...DEFAULT_CONFIG, injectProjectSkillHint: false }, deps);
  assert(
    "13. injectProjectSkillHint gates the guideline and leads the prompt",
    on[0] === "PROJECT SKILL LINE" && !off.includes("PROJECT SKILL LINE"),
    JSON.stringify(off.slice(0, 2))
  );

  // 14. Consent policy: no evidence is always silent, "never" is remembered,
  //     a typo falls back to asking instead of loading behind the operator's back.
  const noEvidence = { ...fingerprint, hasLotusScript: false };
  const decisions: Array<[string, string, boolean]> = [
    ["no evidence + always → skip", skillPromptDecision(noEvidence, { skillPrompt: "always" }), false],
    ["evidence + ask → ask", skillPromptDecision(fingerprint, { skillPrompt: "ask" }), false],
    ["evidence + always → load", skillPromptDecision(fingerprint, { skillPrompt: "always" }), true],
    ["evidence + never → skip", skillPromptDecision(fingerprint, { skillPrompt: "never" }), false],
    ["typo → ask (safe)", skillPromptDecision(fingerprint, { skillPrompt: "alwyas" as never }), false],
  ];
  for (const [label, decision, expectLoad] of decisions) {
    const ok = expectLoad ? decision === "load" : decision !== "load";
    assert(`14. ${label}`, ok, decision);
  }

  // 15. Modal answers map to an outcome; only "never" is persisted.
  const outcomes = [skillChoiceOutcome("load"), skillChoiceOutcome("skip"), skillChoiceOutcome("never")];
  assert(
    "15. modal answers → load / skip / persist-never",
    outcomes[0]!.load && outcomes[0]!.persist === undefined &&
      !outcomes[1]!.load && outcomes[1]!.persist === undefined &&
      !outcomes[2]!.load && outcomes[2]!.persist === "never",
    JSON.stringify(outcomes)
  );

  // 16. The injected message names the skill directory and carries the body.
  const body = readEntrySkillBody();
  const skillDir = skillPath.replace(/[\\/][^\\/]+$/, "");
  const wrapped = wrapSkillMessage(body ?? "BODY", skillPath);
  assert(
    "16. skill body wraps with its reference directory",
    Boolean(body && body.includes("LotusScript")) && wrapped.includes(skillDir) && wrapped.includes((body ?? "BODY").trim()),
    wrapped.slice(0, 120)
  );

  // 17. The lotus modal renders width-safe and answers every key path.
  const strings = stringsFor("cs");
  const tui = { requestRender: () => {} } as any;
  const theme = { fg: (_c: string, t: string) => t } as any;
  const answers: string[] = [];
  const modal = new LotusSkillPromptComponent(tui, theme, strings, fingerprint, (choice) => answers.push(choice));
  const lines = modal.render(60);
  const widthSafe = modal.render(32).every((line) => visibleWidth(line) <= 32);
  const rendered = lines.join("\n");
  assert(
    "17. modal renders the question, evidence and every action width-safe",
    widthSafe &&
      rendered.includes(fingerprint.sampleFile!) &&
      rendered.includes(strings.skillModal.actionLoad) &&
      rendered.includes(strings.skillModal.actionNever),
    rendered.slice(0, 200)
  );
  modal.handleInput("y");
  const second = new LotusSkillPromptComponent(tui, theme, strings, fingerprint, (choice) => answers.push(choice));
  second.handleInput("\x1b");
  const third = new LotusSkillPromptComponent(tui, theme, strings, fingerprint, (choice) => answers.push(choice));
  third.handleInput("\x1b[B");
  third.handleInput("\x1b[B");
  third.handleInput("\r");
  console.log("18. y loads, Esc skips, two downs + Enter answers never:", answers.join(",") === "load,skip,never" ? "PASS" : "FAIL");
  if (!(answers.join(",") === "load,skip,never")) throw new Error(answers.join(","));

  // 19. Resource discovery (SPAI-009): advertised only where it belongs.
  const advertises = discoverSkillResources(fingerprint, skillPath, { skillPrompt: "ask" });
  const silent = [
    discoverSkillResources(noEvidence, skillPath, { skillPrompt: "ask" }),
    discoverSkillResources(noEvidence, skillPath, { skillPrompt: "always" }),
    discoverSkillResources(fingerprint, skillPath, { skillPrompt: "never" }),
    discoverSkillResources(fingerprint, null, { skillPrompt: "always" }),
  ];
  assert(
    "19. resources_discover advertises only in a Domino project, never on opt-out",
    advertises.skillPaths?.[0] === skillPath && silent.every((r) => r.skillPaths === undefined),
    JSON.stringify({ advertises, silent })
  );
}
