import fs from "node:fs";
import path from "node:path";
import {
  agentTemplate,
  libraryTemplate,
  procedureTemplate,
  modularFolderTemplate,
} from "./templates.js";

export * from "./templates.js";

export type ScaffoldTargetType = "agent" | "library" | "procedure" | "modular";

export interface ScaffoldResult {
  ok: boolean;
  type: ScaffoldTargetType;
  createdFiles: string[];
  message: string;
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
}): ScaffoldResult {
  const dir = path.resolve(options.targetDir || process.cwd());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rawName = (options.name || "").trim();
  if (!rawName) {
    throw new Error("Scaffold name cannot be empty.");
  }

  switch (options.type) {
    case "agent": {
      const cleanName = rawName.endsWith(".lss") ? rawName : `${rawName}.lss`;
      const targetFile = path.join(dir, cleanName);
      if (fs.existsSync(targetFile)) {
        throw new Error(`File already exists: ${targetFile}`);
      }
      const content = agentTemplate({
        name: rawName,
        purpose: options.purpose,
        author: options.author,
      });
      fs.writeFileSync(targetFile, content, "utf-8");
      return {
        ok: true,
        type: "agent",
        createdFiles: [targetFile],
        message: `Agent scaffold created at: ${targetFile}`,
      };
    }

    case "library": {
      const cleanName = rawName.endsWith(".lss") ? rawName : `${rawName}.lss`;
      const targetFile = path.join(dir, cleanName);
      if (fs.existsSync(targetFile)) {
        throw new Error(`File already exists: ${targetFile}`);
      }
      const content = libraryTemplate({
        name: rawName,
        purpose: options.purpose,
        author: options.author,
      });
      fs.writeFileSync(targetFile, content, "utf-8");
      return {
        ok: true,
        type: "library",
        createdFiles: [targetFile],
        message: `Script library scaffold created at: ${targetFile}`,
      };
    }

    case "procedure": {
      const isFunc = options.isFunction ?? false;
      const prefix = isFunc ? "func_" : "sub_";
      const baseName = rawName.replace(/^(sub_|func_)/i, "").replace(/\.lss$/i, "");
      const fileName = `${prefix}${baseName}.lss`;
      const targetFile = path.join(dir, fileName);
      if (fs.existsSync(targetFile)) {
        throw new Error(`Procedure file already exists: ${targetFile}`);
      }
      const content = procedureTemplate({
        name: baseName,
        agentName: options.parentAgent || path.basename(dir),
        isFunction: isFunc,
        returnType: options.returnType,
        params: options.params,
        purpose: options.purpose,
        author: options.author,
      });
      fs.writeFileSync(targetFile, content, "utf-8");
      return {
        ok: true,
        type: "procedure",
        createdFiles: [targetFile],
        message: `Procedure scaffold (${isFunc ? "Function" : "Sub"}) created at: ${targetFile}`,
      };
    }

    case "modular": {
      const folderName = rawName.replace(/\.lss$/i, "");
      const targetFolder = path.join(dir, folderName);
      if (fs.existsSync(targetFolder)) {
        throw new Error(`Modular directory already exists: ${targetFolder}`);
      }
      fs.mkdirSync(targetFolder, { recursive: true });

      const files = modularFolderTemplate(folderName, options.purpose);
      const created: string[] = [];

      for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(targetFolder, filename);
        fs.writeFileSync(filePath, content, "utf-8");
        created.push(filePath);
      }

      return {
        ok: true,
        type: "modular",
        createdFiles: created,
        message: `Modular agent folder scaffolded at: ${targetFolder} (${created.length} files)`,
      };
    }

    default: {
      throw new Error(`Unknown scaffold target type: ${options.type}`);
    }
  }
}
