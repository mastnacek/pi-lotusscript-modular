import fs from "node:fs";
import path from "node:path";
import {
  agentTemplate,
  libraryTemplate,
  fillTemplate,
  toDesignerVariant,
} from "./templates.js";
import { getBundledTemplatePath } from "./template-source.js";
import { suggestAlias, buildDesignerNotice } from "./naming.js";

export * from "./templates.js";
export * from "./template-source.js";
export { suggestAlias, buildDesignerNotice } from "./naming.js";

export type ScaffoldTargetType = "agent" | "library";

/**
 * Where the scaffolded file is going: `file` keeps the standalone shape (its
 * own `Const LSI_THREAD_*`), `designer` renders the paste-ready variant that
 * omits the block Designer already declares (coding-conventions.md §1).
 */
export type ScaffoldVariant = "file" | "designer";

export interface ScaffoldResult {
  ok: boolean;
  type: ScaffoldTargetType;
  createdFiles: string[];
  message: string;
  /** Convention-compliant alias suggestion. */
  alias?: string;
  /** User-facing Designer registration notice (Czech). */
  noticeCs?: string;
  /** Agent-facing Designer registration notice (English). */
  noticeEn?: string;
}

export function scaffoldLotusScriptArtifact(options: {
  type: ScaffoldTargetType;
  name: string;
  targetDir?: string;
  purpose?: string;
  author?: string;
  parentAgent?: string;
  isFunction?: boolean;
  returnType?: string;
  params?: string;
  /** Fixed YYYY-MM-DD for the header; omit to use today. */
  date?: string;
  /** `designer` strips the `Const LSI_THREAD_*` block for a Designer paste. */
  target?: ScaffoldVariant;
}): ScaffoldResult {
  const dir = path.resolve(options.targetDir || process.cwd());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rawName = (options.name || "").trim();
  if (!rawName) {
    throw new Error("Scaffold name cannot be empty.");
  }

  const target: ScaffoldVariant = options.target ?? "file";
  if (target !== "file" && target !== "designer") {
    throw new Error(`Unknown scaffold target: ${String(options.target)}`);
  }
  /** Standalone shape or the paste-ready Designer variant. */
  const forTarget = (content: string): string =>
    target === "designer" ? toDesignerVariant(content) : content;

  /**
   * Renders from the template shipped inside the plugin, so the scaffold always
   * matches the installed version. Falls back to the built-in skeleton only if
   * the file is unreadable.
   */
  const fromTemplate = (
    type: "agent" | "library",
    name: string,
  ): string | null => {
    const tplPath = getBundledTemplatePath();
    try {
      return fillTemplate(fs.readFileSync(tplPath, "utf-8"), {
        name,
        purpose: options.purpose,
        author: options.author,
        date: options.date,
        libraryVersion: type === "library" ? "0.1" : undefined,
      });
    } catch (err: unknown) {
      console.error(`[LotusScript Modular] Failed to read template ${tplPath}: ${err}`);
      return null;
    }
  };

  switch (options.type) {
    case "agent": {
      const cleanName = rawName.endsWith(".lss") ? rawName : `${rawName}.lss`;
      const targetFile = path.join(dir, cleanName);
      if (fs.existsSync(targetFile)) {
        throw new Error(`File already exists: ${targetFile}`);
      }
      const content = fromTemplate("agent", rawName) ?? agentTemplate({
        name: rawName,
        purpose: options.purpose,
        author: options.author,
        date: options.date,
      });
      fs.writeFileSync(targetFile, forTarget(content), "utf-8");
      const alias = suggestAlias(rawName, "agent");
      const info = {
        elementType: "Agent (standalone .lss)" as const,
        name: rawName,
        alias,
        purpose: options.purpose,
        targetDir: dir,
      };
      return {
        ok: true,
        type: "agent",
        createdFiles: [targetFile],
        message: `Agent scaffold created at: ${targetFile}`,
        alias,
        noticeCs: buildDesignerNotice(info, "cs"),
        noticeEn: buildDesignerNotice(info, "en"),
      };
    }

    case "library": {
      const cleanName = rawName.endsWith(".lss") ? rawName : `${rawName}.lss`;
      const targetFile = path.join(dir, cleanName);
      if (fs.existsSync(targetFile)) {
        throw new Error(`File already exists: ${targetFile}`);
      }
      const content = fromTemplate("library", rawName) ?? libraryTemplate({
        name: rawName,
        purpose: options.purpose,
        author: options.author,
        date: options.date,
      });
      fs.writeFileSync(targetFile, forTarget(content), "utf-8");
      const alias = suggestAlias(rawName, "library");
      const info = {
        elementType: "Script Library (.lss)" as const,
        name: rawName,
        alias,
        purpose: options.purpose,
        targetDir: dir,
      };
      return {
        ok: true,
        type: "library",
        createdFiles: [targetFile],
        message: `Script library scaffold created at: ${targetFile}`,
        alias,
        noticeCs: buildDesignerNotice(info, "cs"),
        noticeEn: buildDesignerNotice(info, "en"),
      };
    }


    default: {
      throw new Error(`Unknown scaffold target type: ${options.type}`);
    }
  }
}
