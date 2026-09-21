import type {
  CommentAnalysis,
  JevFolderEvalResult,
  JevProcedureEval,
} from "../../shared/types.js";

/**
 * Builds deterministic state description and structured questions for JEV Decisions API.
 * Uses strict ground-truth rules so Jev 1.13 evaluates against concrete standards.
 */
export function buildJevPayload(params: {
  fileName: string;
  procedureName: string;
  signature: string;
  codeSnippet: string;
  analysis: CommentAnalysis;
  jevModel?: string;
}): { model: string; state: string; questions: Record<string, unknown> } {
  const { fileName, procedureName, signature, codeSnippet, analysis, jevModel } = params;

  const stateLines = [
    "=== STRICT PI AGENT SPECIFICATION (GROUND TRUTH) ===",
    "1. Strict Comment Rules:",
    "   - MUST have concise Czech purpose: \"' Účel: <popis>\".",
    "   - MUST NOT be trivial, placeholder, or just repeat procedure name (e.g. \"' Účel: test\", \"' Účel: zpracování\" are INVALID).",
    "   - MUST include modular header directives (' @script-member-of, ' @procedure, ' @parent-declarations).",
    "   - MUST NOT contain legacy Domino %REM templates (Author:, Date:, Description:, Revision:).",
    "   - MUST NOT contain decorative divider bars (' **********, Rem ----------).",
    "2. Strict Runtime Safety Rules:",
    "   - Must have proper LotusScript error handling (On Error GoTo or error bubble).",
    "   - No unescaped string concatenation in Evaluate() formulas (injection risk).",
    "   - No mutation of ForAll loop pointer variable.",
    "   - No UI workspace calls (NotesUIWorkspace) in backend agent code.",
    "",
    "=== EVALUATION TARGET ===",
    `File: ${fileName}`,
    `Procedure: ${procedureName}`,
    `Signature: ${signature || "(none)"}`,
    `Deterministic style pre-check: ${analysis.style}`,
    `Has Czech purpose comment: ${analysis.hasCzechPurpose ? "YES" : "NO"}`,
    `Extracted purpose text: "${analysis.purposeText || "(none)"}"`,
    `Legacy markers found: ${analysis.legacyMarkers.join(" | ") || "(none)"}`,
    `Total lines: ${analysis.totalLines}, Comment lines: ${analysis.commentLines}`,
    "",
    "=== PROCEDURE CODE EXCERPT ===",
    "```lotusscript",
    codeSnippet,
    "```",
  ];

  return {
    model: jevModel || "typesafe/jev-1.13",
    state: stateLines.join("\n"),
    questions: {
      is_strictly_new_style: {
        type: "noul",
        instructions:
          "Does this procedure's header documentation strictly adhere to the new PI agent style (' Účel: <Czech description> with modular directives) and completely lack legacy Domino %REM templates or divider bars?",
      },
      is_trivial_comment: {
        type: "noul",
        instructions:
          "Is the Czech purpose comment trivial, dummy placeholder text (e.g. 'test', 'zpracování', 'pomocná funkce'), or merely reciting the procedure name without explaining the actual business logic?",
      },
      purpose_accuracy: {
        type: "score",
        instructions:
          "Rate the semantic accuracy and depth of the Czech purpose comment against what the code actually does:",
        criteria: [
          "Level 0: Missing, misleading, or trivial placeholder ('test', 'funkce', copy-pasted name)",
          "Level 1: Vague or generic description without explaining inputs, database actions, or logic",
          "Level 2: Accurate, concrete Czech explanation of procedure logic, parameters, and side-effects",
        ],
      },
      has_runtime_trap: {
        type: "noul",
        instructions:
          "Does this LotusScript code introduce dangerous Domino runtime gotchas (unhandled errors, unescaped Evaluate quote injection, ForAll alias mutation, or UI in backend)?",
      },
      gotcha_severity: {
        type: "score",
        instructions:
          "Rate the severity of LotusScript runtime risks or bugs in this procedure:",
        criteria: [
          "Level 0: Safe, clean, idiomatic LotusScript with appropriate error handling",
          "Level 1: Minor issue: missing error handler or potential variant type coercion",
          "Level 2: Critical runtime failure: uncaught crash, data corruption, or Evaluate injection",
        ],
      },
    },
  };
}

/**
 * Creates fallback evaluation when JEV API is not reached or disabled.
 * Uses 100% deterministic findings.
 */
export function createFallbackEval(
  fileName: string,
  procedureName: string,
  analysis: CommentAnalysis
): JevProcedureEval {
  const isTrivial =
    typeof analysis.purposeText === "string" &&
    (/^(test|zpracování|funkce|sub|todo|xxx)$/i.test(analysis.purposeText.trim()) ||
      analysis.purposeText.trim().toLowerCase() === procedureName.toLowerCase());

  const styleCompliant = analysis.style === "new" && !isTrivial;
  const purposeQuality = isTrivial ? 0 : analysis.hasCzechPurpose ? 2 : 0;
  const gotchaRisk = analysis.hasLegacyBlock ? 1 : 0;

  const summary =
    isTrivial
      ? "STRICT FAIL: trivial / placeholder purpose comment"
      : analysis.style === "new"
        ? "STRICT PASS: new-style comment with a purpose description (' Účel: ...)"
        : analysis.style === "old"
          ? "STRICT FAIL: legacy comment style (%REM template or missing ' Účel:)"
          : analysis.style === "mixed"
            ? "STRICT WARN: mixed comment style (has ' Účel: plus legacy markers/dividers)"
            : "STRICT FAIL: no purpose description and no documentation comment";

  return {
    fileName,
    procedureName,
    commentStyle: analysis.style,
    styleCompliant,
    purposeQualityScore: purposeQuality,
    gotchaRiskScore: gotchaRisk,
    summary,
    modelUsed: "deterministic-strict",
  };
}

/**
 * Parses raw JSON answers from OpenRouter Decisions API using calibrated thresholds.
 *
 * Strict calibrated thresholds for Jev 1.13:
 * - is_strictly_new_style: noul >= 0.80 (strict certainty required)
 * - is_trivial_comment: noul <= 0.20 (flagged if > 0.20)
 * - purpose_accuracy: score >= 1.6 (high accuracy required)
 * - has_runtime_trap: noul <= 0.20 (strict safety threshold)
 */
export function parseJevResponse(
  data: unknown,
  analysis: CommentAnalysis,
  fileName: string,
  procedureName: string
): JevProcedureEval {
  if (!data || typeof data !== "object") {
    return createFallbackEval(fileName, procedureName, analysis);
  }

  const raw = data as {
    model?: string;
    answers?: {
      is_strictly_new_style?: { noul?: number };
      is_trivial_comment?: { noul?: number };
      purpose_accuracy?: { score?: number; confidence?: number };
      has_runtime_trap?: { noul?: number };
      gotcha_severity?: { score?: number; confidence?: number };
      style_compliance?: { choice?: string };
      gotcha_risk?: { score?: number };
    };
    usage?: { cost?: number };
  };

  const newStyleNoul = raw.answers?.is_strictly_new_style?.noul ?? (analysis.style === "new" ? 0.95 : 0.05);
  const trivialNoul = raw.answers?.is_trivial_comment?.noul ?? 0.02;
  const quality = raw.answers?.purpose_accuracy?.score ?? (analysis.hasCzechPurpose ? 2 : 0);
  const trapNoul = raw.answers?.has_runtime_trap?.noul ?? (analysis.hasLegacyBlock ? 0.35 : 0.05);
  const gotchaSev = raw.answers?.gotcha_severity?.score ?? (raw.answers?.gotcha_risk?.score ?? 0);

  // Strict thresholds
  const isStrictlyNew = newStyleNoul >= 0.8;
  const isTrivial = trivialNoul > 0.2;
  const isQualityStrict = quality >= 1.6;
  const isRuntimeSafe = trapNoul <= 0.25 && gotchaSev < 0.6;

  let resolvedStyle = analysis.style;
  if (isStrictlyNew && !isTrivial) {
    resolvedStyle = "new";
  } else if (analysis.hasCzechPurpose && (isTrivial || analysis.hasLegacyBlock)) {
    resolvedStyle = "mixed";
  } else if (analysis.hasLegacyBlock || newStyleNoul < 0.4) {
    resolvedStyle = "old";
  } else if (!analysis.hasCzechPurpose) {
    resolvedStyle = "none";
  }

  const styleCompliant = isStrictlyNew && !isTrivial && isQualityStrict && !analysis.hasLegacyBlock;

  const riskScore = gotchaSev >= 1.3 || trapNoul > 0.6 ? 2 : gotchaSev >= 0.5 || trapNoul > 0.25 ? 1 : 0;
  const riskLabels = ["clean (no trap)", "risk warning", "critical runtime risk"] as const;
  const riskLabel = riskLabels[riskScore] ?? "critical runtime risk";

  let verdict = "STRICT PASS";
  if (!styleCompliant) {
    if (isTrivial) verdict = "STRICT FAIL (trivial / placeholder comment)";
    else if (resolvedStyle === "old") verdict = "STRICT FAIL (legacy %REM style)";
    else if (resolvedStyle === "mixed") verdict = "STRICT WARN (mixed style / legacy markers)";
    else if (!isQualityStrict) verdict = "STRICT FAIL (low purpose quality)";
    else verdict = "STRICT FAIL (does not meet the standard)";
  } else if (!isRuntimeSafe) {
    verdict = "STRICT WARN (runtime risk detected)";
  }

  const summary = `${verdict} | style: ${resolvedStyle.toUpperCase()} (p=${newStyleNoul.toFixed(2)}) | purpose quality: ${quality.toFixed(1)}/2 | gotcha: ${riskLabel}`;

  return {
    fileName,
    procedureName,
    commentStyle: resolvedStyle,
    styleCompliant,
    purposeQualityScore: Number(quality.toFixed(1)),
    gotchaRiskScore: riskScore,
    summary,
    modelUsed: raw.model || "typesafe/jev-1.13",
    costUsd: raw.usage?.cost,
  };
}

/**
 * Aggregates evaluations of individual procedures into a folder summary.
 */
export function buildFolderSummary(evals: JevProcedureEval[]): JevFolderEvalResult {
  let newStyleCount = 0;
  let oldStyleCount = 0;
  let mixedStyleCount = 0;
  let uncommentedCount = 0;
  let compliantCount = 0;
  let totalQuality = 0;
  let maxGotchaRisk = 0;
  let totalCostUsd = 0;

  for (const item of evals) {
    if (item.commentStyle === "new") newStyleCount++;
    else if (item.commentStyle === "old") oldStyleCount++;
    else if (item.commentStyle === "mixed") mixedStyleCount++;
    else uncommentedCount++;

    if (item.styleCompliant) compliantCount++;

    totalQuality += item.purposeQualityScore;
    if (item.gotchaRiskScore > maxGotchaRisk) {
      maxGotchaRisk = item.gotchaRiskScore;
    }
    if (typeof item.costUsd === "number") {
      totalCostUsd += item.costUsd;
    }
  }

  const total = evals.length;
  const averageQuality = total > 0 ? Number((totalQuality / total).toFixed(1)) : 0;
  // Strict folder approval: 100% compliant, 0 old/mixed/uncommented, 0 critical risk
  const ok = total > 0 && compliantCount === total && oldStyleCount === 0 && mixedStyleCount === 0 && maxGotchaRisk <= 1;

  const summary = [
    `New style (compliant): ${compliantCount}/${total}`,
    oldStyleCount > 0 ? `Legacy style (%REM): ${oldStyleCount}` : "",
    mixedStyleCount > 0 ? `Mixed / trivial style: ${mixedStyleCount}` : "",
    uncommentedCount > 0 ? `No comment: ${uncommentedCount}` : "",
    `Average purpose quality: ${averageQuality}/2`,
    `Max gotcha risk: ${["clean", "warning", "high"][maxGotchaRisk] ?? "high"}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    ok,
    newStyleCount,
    oldStyleCount,
    mixedStyleCount,
    uncommentedCount,
    procedures: evals,
    averageQuality,
    maxGotchaRisk,
    totalCostUsd,
    summary,
  };
}
