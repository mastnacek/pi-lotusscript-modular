import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentManifest, CodeBlock } from "../../shared/types.js";
import {
  decodeXml,
  detectProcPrefix,
  getTimestamp,
  sanitizeFileName,
} from "../../shared/paths.js";

export class AgentParser {
  /**
   * Decompile a bare LotusScript source file (.lss) into a modular folder structure.
   */
  static decompileLss(lssPath: string, outputDirOverride?: string): string {
    const resolvedLss = path.resolve(lssPath);
    if (!fs.existsSync(resolvedLss)) {
      throw new Error(`LSS file not found: ${resolvedLss}`);
    }

    const content = fs.readFileSync(resolvedLss, "utf-8");
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const scriptName = path.basename(resolvedLss, ".lss");

    const lssDir = path.dirname(resolvedLss);
    const targetDir = outputDirOverride ? path.resolve(outputDirOverride) : path.join(lssDir, scriptName);

    const reProcStart = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+([A-Za-z_][A-Za-z0-9_]*)/i;
    const reProcEnd = /^\s*End\s+(?:Sub|Function|Property)\b/i;
    const reBlockStart = /^\s*(?:(?:Public|Private)\s+)?(?:Class|Type)\s+[A-Za-z_]/i;
    const reBlockEnd = /^\s*End\s+(?:Class|Type)\b/i;
    const reOption = /^\s*(?:Option\s|Use\s|UseLSX\s|%Include\s)/i;

    const optionsLines: string[] = [];
    const declLines: string[] = [];
    const procs: { name: string; lines: string[]; kind: CodeBlock["kind"]; fileName: string }[] = [];

    let currentProc: { name: string; lines: string[]; kind: CodeBlock["kind"]; fileName: string } | null = null;
    let inRemBlock = false;
    let pendingDocLines: string[] = [];
    let insideClassOrType = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      if (/^\s*%REM\b/i.test(trimmed)) {
        inRemBlock = true;
        pendingDocLines.push(line);
        continue;
      }
      if (inRemBlock) {
        pendingDocLines.push(line);
        if (/^\s*%END\s*REM\b/i.test(trimmed)) {
          inRemBlock = false;
        }
        continue;
      }

      if (currentProc) {
        currentProc.lines.push(line);
        if (reProcEnd.test(trimmed)) {
          procs.push(currentProc);
          currentProc = null;
        }
        continue;
      }

      if (insideClassOrType) {
        declLines.push(...pendingDocLines, line);
        pendingDocLines = [];
        if (reBlockEnd.test(trimmed)) {
          insideClassOrType = false;
        }
        continue;
      }

      if (reBlockStart.test(trimmed)) {
        insideClassOrType = true;
        declLines.push(...pendingDocLines, line);
        pendingDocLines = [];
        continue;
      }

      const procMatch = reProcStart.exec(trimmed);
      if (procMatch) {
        const pName = procMatch[1]!;
        let kind: CodeBlock["kind"] = "procedure";
        let fileName = "";

        if (pName.toLowerCase() === "initialize") {
          kind = "initialize";
          fileName = "99_initialize.lss";
        } else if (pName.toLowerCase() === "terminate") {
          kind = "terminate";
          fileName = "99_terminate.lss";
        } else {
          const prefix = detectProcPrefix(trimmed);
          const safeName = sanitizeFileName(pName);
          fileName = `${prefix}${safeName}.lss`;
        }

        currentProc = {
          name: pName,
          lines: [...pendingDocLines, line],
          kind,
          fileName,
        };
        pendingDocLines = [];
        continue;
      }

      if (reOption.test(trimmed)) {
        optionsLines.push(...pendingDocLines, line);
        pendingDocLines = [];
        continue;
      }

      declLines.push(...pendingDocLines, line);
      pendingDocLines = [];
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const order: CodeBlock[] = [];

    const optContent = optionsLines.join("\n").trim();
    if (optContent) {
      order.push({
        event: "(Options)",
        code: optContent,
        kind: "options",
        fileName: "00_options.lss",
      });
    }

    const declContent = declLines.join("\n").trim();
    if (declContent) {
      order.push({
        event: "(Declarations)",
        code: declContent,
        kind: "declarations",
        fileName: "01_declarations.lss",
      });
    }

    const customProcs = procs.filter((p) => p.kind === "procedure");
    const inits = procs.filter((p) => p.kind === "initialize");
    const terms = procs.filter((p) => p.kind === "terminate");

    for (const p of customProcs) {
      order.push({
        event: p.name,
        code: p.lines.join("\n").trim(),
        kind: p.kind,
        fileName: p.fileName,
      });
    }

    for (const p of inits) {
      order.push({
        event: "Initialize",
        code: p.lines.join("\n").trim(),
        kind: p.kind,
        fileName: p.fileName,
      });
    }

    for (const p of terms) {
      order.push({
        event: "Terminate",
        code: p.lines.join("\n").trim(),
        kind: p.kind,
        fileName: p.fileName,
      });
    }

    const relativeSource = path.relative(targetDir, resolvedLss).replace(/\\/g, "/");
    const timestampIso = new Date().toISOString();

    for (const b of order) {
      const filePath = path.join(targetDir, b.fileName);
      let fileContent = "";
      if (b.kind === "procedure") {
        fileContent = [
          `' @script-member-of: ${scriptName}`,
          `' @procedure: ${b.event}`,
          `' @parent-declarations: 01_declarations.lss`,
          "",
          b.code,
          "",
        ].join("\n");
      } else {
        fileContent = b.code + "\n";
      }
      fs.writeFileSync(filePath, fileContent, "utf-8");
    }

    const manifest: AgentManifest = {
      formatVersion: "1.0",
      agentName: scriptName,
      sourceDxl: relativeSource,
      decompileTimestamp: timestampIso,
      compilationOrder: order.map((o) => o.fileName),
    };

    fs.writeFileSync(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    const mainLssLines = [
      `' @script-root: ${scriptName}`,
      `' @source-file: ${relativeSource}`,
      `' @decompile-timestamp: ${timestampIso}`,
      `'`,
      `' Synthetic virtual imports for PI skill & developer navigation:`,
    ];
    for (const b of order) {
      mainLssLines.push(`' %pi-import "${b.fileName}"`);
    }
    mainLssLines.push("");
    fs.writeFileSync(path.join(targetDir, "main.lss"), mainLssLines.join("\n"), "utf-8");

    return targetDir;
  }

  /**
   * Decompile a Domino Agent DXL XML file into a modular folder structure.
   */
  static decompileDxl(dxlPath: string, outputDirOverride?: string): string | null {
    const resolvedDxl = path.resolve(dxlPath);
    if (!fs.existsSync(resolvedDxl)) {
      throw new Error(`DXL file not found: ${resolvedDxl}`);
    }

    const xml = fs.readFileSync(resolvedDxl, "utf-8");
    const nameMatch = /<agent\b[^>]*\bname=['"]([^'"]+)['"]/i.exec(xml);
    const rawAgentName = nameMatch ? decodeXml(nameMatch[1]!) : path.basename(resolvedDxl, ".dxl");

    const dxlDir = path.dirname(resolvedDxl);
    const targetDir = outputDirOverride
      ? path.resolve(outputDirOverride)
      : path.join(dxlDir, sanitizeFileName(rawAgentName));

    const codeBlockRegex = /<code\s+event=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/code>/gi;
    let match: RegExpExecArray | null;

    const blocks: CodeBlock[] = [];

    while ((match = codeBlockRegex.exec(xml)) !== null) {
      const event = match[1]!;
      const innerContent = match[2]!;

      const lotussctiptMatch = /<lotusscript>([\s\S]*?)<\/lotusscript>/i.exec(innerContent);
      if (!lotussctiptMatch) continue;

      const code = decodeXml(lotussctiptMatch[1]!).replace(/\r\n/g, "\n").trim();
      if (!code) continue;

      let kind: CodeBlock["kind"] = "procedure";
      let fileName = "";

      const lowerEvent = event.toLowerCase();
      if (lowerEvent === "options") {
        kind = "options";
        fileName = "00_options.lss";
      } else if (lowerEvent === "declarations") {
        kind = "declarations";
        fileName = "01_declarations.lss";
      } else if (lowerEvent === "initialize" || lowerEvent === "action") {
        kind = "initialize";
        fileName = "99_initialize.lss";
      } else if (lowerEvent === "terminate") {
        kind = "terminate";
        fileName = "99_terminate.lss";
      } else {
        kind = "procedure";
        const prefix = detectProcPrefix(code);
        const safeEvent = sanitizeFileName(event);
        fileName = `${prefix}${safeEvent}.lss`;
      }

      blocks.push({ event, code, kind, fileName });
    }

    if (blocks.length === 0) return null;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const order: CodeBlock[] = [];
    const options = blocks.filter((b) => b.kind === "options");
    const decls = blocks.filter((b) => b.kind === "declarations");
    const procs = blocks.filter((b) => b.kind === "procedure");
    const inits = blocks.filter((b) => b.kind === "initialize");
    const terms = blocks.filter((b) => b.kind === "terminate");

    order.push(...options, ...decls, ...procs, ...inits, ...terms);

    const relativeDxl = path.relative(targetDir, resolvedDxl).replace(/\\/g, "/");
    const timestampIso = new Date().toISOString();

    for (const b of order) {
      const filePath = path.join(targetDir, b.fileName);
      let fileContent = "";
      if (b.kind === "procedure") {
        fileContent = [
          `' @agent-member-of: ${rawAgentName}`,
          `' @event: ${b.event}`,
          `' @parent-declarations: 01_declarations.lss`,
          "",
          b.code,
          "",
        ].join("\n");
      } else {
        fileContent = b.code + "\n";
      }
      fs.writeFileSync(filePath, fileContent, "utf-8");
    }

    const manifest: AgentManifest = {
      formatVersion: "1.0",
      agentName: rawAgentName,
      sourceDxl: relativeDxl,
      decompileTimestamp: timestampIso,
      compilationOrder: order.map((b) => b.fileName),
    };

    fs.writeFileSync(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    const mainLssLines = [
      `' @agent-root: ${rawAgentName}`,
      `' @source-dxl: ${relativeDxl}`,
      `' @decompile-timestamp: ${timestampIso}`,
      `'`,
      `' Synthetic virtual imports for PI skill & developer navigation:`,
    ];
    for (const b of order) {
      mainLssLines.push(`' %pi-import "${b.fileName}"`);
    }
    mainLssLines.push("");
    fs.writeFileSync(path.join(targetDir, "main.lss"), mainLssLines.join("\n"), "utf-8");

    return targetDir;
  }

  /**
   * Synchronize manifest.json and main.lss with any files added or removed on disk.
   */
  static syncManifest(targetDirOrFile: string): AgentManifest {
    let agentDir = path.resolve(targetDirOrFile);
    if (fs.existsSync(agentDir) && fs.statSync(agentDir).isFile()) {
      agentDir = path.dirname(agentDir);
    }

    const manifestPath = path.join(agentDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest.json not found in directory: ${agentDir}`);
    }

    let manifest: AgentManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as AgentManifest;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse manifest.json at ${manifestPath}: ${msg}`);
    }
    const files = fs.readdirSync(agentDir);

    const lssFiles = files.filter(
      (f) =>
        f.endsWith(".lss") &&
        f !== "main.lss" &&
        !f.endsWith("_compiled.lss") &&
        !/_compiled\.lss$/i.test(f)
    );

    const updatedOrder: string[] = [];
    for (const f of manifest.compilationOrder) {
      if (lssFiles.includes(f) && !updatedOrder.includes(f)) {
        updatedOrder.push(f);
      }
    }

    const newFiles = lssFiles.filter((f) => !updatedOrder.includes(f));

    for (const f of newFiles) {
      if (f === "00_options.lss") {
        updatedOrder.unshift(f);
      } else if (f === "01_declarations.lss") {
        const optIdx = updatedOrder.indexOf("00_options.lss");
        if (optIdx !== -1) {
          updatedOrder.splice(optIdx + 1, 0, f);
        } else {
          updatedOrder.unshift(f);
        }
      } else if (f === "99_initialize.lss") {
        const termIdx = updatedOrder.indexOf("99_terminate.lss");
        if (termIdx !== -1) {
          updatedOrder.splice(termIdx, 0, f);
        } else {
          updatedOrder.push(f);
        }
      } else if (f === "99_terminate.lss") {
        updatedOrder.push(f);
      } else {
        const initIdx = updatedOrder.indexOf("99_initialize.lss");
        if (initIdx !== -1) {
          updatedOrder.splice(initIdx, 0, f);
        } else {
          const termIdx = updatedOrder.indexOf("99_terminate.lss");
          if (termIdx !== -1) {
            updatedOrder.splice(termIdx, 0, f);
          } else {
            updatedOrder.push(f);
          }
        }
      }
    }

    manifest.compilationOrder = updatedOrder;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    const mainLssPath = path.join(agentDir, "main.lss");
    if (fs.existsSync(mainLssPath)) {
      const mainLines = [
        `' @agent-root: ${manifest.agentName}`,
        `' @source-dxl: ${manifest.sourceDxl || ""}`,
        `' @decompile-timestamp: ${manifest.decompileTimestamp || ""}`,
        `'`,
        `' Synthetic virtual imports for PI skill & developer navigation:`,
      ];
      for (const item of manifest.compilationOrder) {
        mainLines.push(`' %pi-import "${item}"`);
      }
      mainLines.push("");
      fs.writeFileSync(mainLssPath, mainLines.join("\n"), "utf-8");
    }

    return manifest;
  }

  /**
   * Recompile modular files into a single <AgentName>_compiled.lss file.
   * If overwriteSourceLss is enabled, also updates the original .lss file.
   */
  static compileAgent(
    targetDirOrFile: string,
    options?: { keepTimestamp?: boolean; overwriteSourceLss?: boolean }
  ): string {
    let agentDir = path.resolve(targetDirOrFile);
    if (fs.existsSync(agentDir) && fs.statSync(agentDir).isFile()) {
      agentDir = path.dirname(agentDir);
    }

    const manifestPath = path.join(agentDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest.json not found in directory: ${agentDir}`);
    }

    const manifest = AgentParser.syncManifest(agentDir);
    const safeName = sanitizeFileName(manifest.agentName);
    const canonicalOutPath = path.join(agentDir, `${safeName}_compiled.lss`);

    const lines: string[] = [
      `%REM`,
      `    Agent: ${manifest.agentName}`,
      `    Assembled from modular source files`,
      `    Compiled: ${new Date().toISOString()}`,
      `    Target: Paste entire content into Domino Designer agent`,
      `%END REM`,
      "",
    ];

    for (const fileName of manifest.compilationOrder) {
      const filePath = path.join(agentDir, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing component file: ${filePath}`);
      }

      let content = fs.readFileSync(filePath, "utf-8").trim();

      content = content.replace(/^'(?: @agent-member-of:| @script-member-of:| @event:| @procedure:| @parent-declarations:)[^\r\n]*\r?\n?/gm, "").trim();

      lines.push(`' === SECTION: ${fileName} ===`);
      lines.push(content);
      lines.push(`' === END SECTION: ${fileName} ===\n`);
    }

    const compiledContent = lines.join("\n");
    fs.writeFileSync(canonicalOutPath, compiledContent, "utf-8");

    if (options?.overwriteSourceLss && manifest.sourceDxl) {
      const resolvedSource = path.resolve(agentDir, manifest.sourceDxl);
      if (resolvedSource.toLowerCase().endsWith(".lss") && fs.existsSync(resolvedSource)) {
        fs.writeFileSync(resolvedSource, compiledContent, "utf-8");
      }
    }

    if (options?.keepTimestamp) {
      const timestamp = getTimestamp();
      const timestampedPath = path.join(agentDir, `${safeName}_${timestamp}_compiled.lss`);
      fs.writeFileSync(timestampedPath, compiledContent, "utf-8");
    }

    return canonicalOutPath;
  }
}
