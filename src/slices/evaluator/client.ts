import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  JevFolderEvalResult,
  JevProcedureEval,
} from "../../shared/types.js";
import {
  extractProcedureSnippet,
  scanLotusScriptComments,
} from "./comment-parser.js";
import {
  buildFolderSummary,
  buildJevPayload,
  createFallbackEval,
  parseJevResponse,
} from "./jev.js";

const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

/**
 * Resolves OpenRouter API key from env, auth.json, or explicit config.
 */
export async function getOpenRouterApiKey(
  explicitKey?: string,
  ctx?: ExtensionContext
): Promise<string | undefined> {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();

  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();

  // ~/.pi/agent/auth.json
  try {
    const authPath = path.join(homedir(), ".pi", "agent", "auth.json");
    if (fs.existsSync(authPath)) {
      const raw = fs.readFileSync(authPath, "utf-8");
      const auth = JSON.parse(raw);
      const or = auth.openrouter;
      if (typeof or === "string" && or) return or;
      if (typeof or?.access === "string" && or.access) return or.access;
      if (typeof or?.apiKey === "string" && or.apiKey) return or.apiKey;
    }
  } catch {
    // Non-fatal
  }

  // ctx.modelRegistry
  if (ctx?.modelRegistry) {
    try {
      const reg = ctx.modelRegistry as any;
      const provider = reg.getProvider?.("openrouter");
      if (provider) {
        const auth = await reg.getProviderAuth?.("openrouter");
        if (auth?.apiKey) return auth.apiKey;
      }
    } catch {
      // Non-fatal
    }
  }

  return undefined;
}

/**
 * Evaluates a single procedure file using JEV or deterministic fallback.
 */
export async function evaluateProcedureWithJev(
  filePath: string,
  options?: {
    apiKey?: string;
    jevModel?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    ctx?: ExtensionContext;
  }
): Promise<JevProcedureEval> {
  const resolved = path.resolve(filePath);
  const fileName = path.basename(resolved);
  if (!fs.existsSync(resolved)) {
    return {
      fileName,
      procedureName: fileName,
      commentStyle: "none",
      styleCompliant: false,
      purposeQualityScore: 0,
      gotchaRiskScore: 0,
      summary: "File not found",
      modelUsed: "offline",
    };
  }

  const content = fs.readFileSync(resolved, "utf-8");
  const analysis = scanLotusScriptComments(content);
  const { name: procedureName, signature, codeSnippet } = extractProcedureSnippet(content);

  const apiKey = await getOpenRouterApiKey(options?.apiKey, options?.ctx);
  if (!apiKey) {
    return createFallbackEval(fileName, procedureName, analysis);
  }

  const payload = buildJevPayload({
    fileName,
    procedureName,
    signature,
    codeSnippet,
    analysis,
    jevModel: options?.jevModel,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 7000);

  try {
    const res = await fetch(OPENROUTER_DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: options?.signal ?? controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return createFallbackEval(fileName, procedureName, analysis);
    }

    const data = await res.json();
    return parseJevResponse(data, analysis, fileName, procedureName);
  } catch {
    clearTimeout(timeoutId);
    return createFallbackEval(fileName, procedureName, analysis);
  }
}

/**
 * Evaluates all procedure files in a modular agent folder.
 */
export async function evaluateFolderWithJev(
  folderPath: string,
  options?: {
    apiKey?: string;
    jevModel?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    ctx?: ExtensionContext;
  }
): Promise<JevFolderEvalResult> {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      newStyleCount: 0,
      oldStyleCount: 0,
      mixedStyleCount: 0,
      uncommentedCount: 0,
      procedures: [],
      averageQuality: 0,
      maxGotchaRisk: 0,
      totalCostUsd: 0,
      summary: "Folder does not exist",
    };
  }

  const files = fs.readdirSync(resolved).filter((f) => {
    const lower = f.toLowerCase();
    return (
      (lower.startsWith("sub_") ||
        lower.startsWith("func_") ||
        lower === "99_initialize.lss" ||
        lower === "99_terminate.lss") &&
      lower.endsWith(".lss")
    );
  });

  const evals: JevProcedureEval[] = [];

  for (const file of files) {
    const filePath = path.join(resolved, file);
    const result = await evaluateProcedureWithJev(filePath, options);
    evals.push(result);
  }

  return buildFolderSummary(evals);
}
