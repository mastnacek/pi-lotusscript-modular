import * as fs from "node:fs";
import * as path from "node:path";

export interface CodeBlock {
  event: string;
  code: string;
  kind: "options" | "declarations" | "procedure" | "initialize" | "terminate";
  fileName: string;
}

export interface AgentManifest {
  formatVersion: string;
  agentName: string;
  sourceDxl: string;
  decompileTimestamp: string;
  compilationOrder: string[];
}

/**
 * Decode XML entities in LotusScript code.
 * Uses single pass regex replacement to prevent double decoding.
 */
export function decodeXml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (entity, dec, hex) => {
    if (dec) return String.fromCharCode(parseInt(dec, 10));
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    switch (entity) {
      case "&amp;": return "&";
      case "&lt;": return "<";
      case "&gt;": return ">";
      case "&quot;": return '"';
      case "&apos;": return "'";
      default: return entity;
    }
  });
}

/**
 * Generate formatted timestamp string: YYYYMMDD_HHMMSS
 */
export function getTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}${month}${day}_${hours}${mins}${secs}`;
}

/**
 * Sanitize name for file or folder in Windows.
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim().replace(/^[. ]+|[. ]+$/g, "");
}

/**
 * Detect procedure prefix from code (sub_, func_, prop_).
 */
export function detectProcPrefix(code: string): string {
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith("%REM") || trimmed.startsWith("%rem")) {
      continue;
    }
    if (/^(?:(?:Public|Private)\s+)?Function\b/i.test(trimmed)) {
      return "func_";
    }
    if (/^(?:(?:Public|Private)\s+)?Sub\b/i.test(trimmed)) {
      return "sub_";
    }
    if (/^(?:(?:Public|Private)\s+)?Property\b/i.test(trimmed)) {
      return "prop_";
    }
    break;
  }
  return "sub_";
}

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
    const reDeclStart = /^\s*(?:(?:Public|Private)\s+)?(?:Const\b|Dim\b|Redim\b)/i;

    const optionsLines: string[] = [];
    const declLines: string[] = [];
    const procs: { name: string; lines: string[]; kind: CodeBlock["kind"]; fileName: string }[] = [];

    let curProc: { name: string; lines: string[] } | null = null;
    let blockDepth = 0;
    let inRem = false;
    let remBuffer: string[] = [];
    let seenOption = false;
    let seenProc = false;
    let pendingDocLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Inside a procedure body
      if (curProc) {
        curProc.lines.push(line);
        if (reProcEnd.test(trimmed)) {
          const procName = curProc.name;
          const procCode = curProc.lines.join("\n");
          let kind: CodeBlock["kind"] = "procedure";
          let fileName = "";

          const nameLower = procName.toLowerCase();
          if (nameLower === "initialize") {
            kind = "initialize";
            fileName = "99_initialize.lss";
          } else if (nameLower === "terminate") {
            kind = "terminate";
            fileName = "99_terminate.lss";
          } else {
            kind = "procedure";
            const prefix = detectProcPrefix(procCode);
            fileName = `${prefix}${sanitizeFileName(procName)}.lss`;
          }

          procs.push({ name: procName, lines: curProc.lines, kind, fileName });
          curProc = null;
          pendingDocLines = [];
        }
        continue;
      }

      // Handle %REM ... %END REM blocks
      if (!inRem && /^%REM\b/i.test(trimmed)) {
        inRem = true;
        remBuffer = [line];
        if (/^%END\s*REM\b/i.test(trimmed)) {
          inRem = false;
          // single line %REM ... %END REM
          if (!seenOption) {
            optionsLines.push(...remBuffer);
          } else if (!seenProc) {
            declLines.push(...remBuffer);
          } else {
            pendingDocLines.push(...remBuffer);
          }
          remBuffer = [];
        }
        continue;
      }

      if (inRem) {
        remBuffer.push(line);
        if (/^%END\s*REM\b/i.test(trimmed)) {
          inRem = false;
          if (!seenOption) {
            optionsLines.push(...remBuffer);
          } else if (!seenProc) {
            // Peek ahead to see if the next non-empty line is a procedure
            let isProcComment = false;
            for (let j = i + 1; j < lines.length; j++) {
              const nextTrim = lines[j].trim();
              if (!nextTrim || nextTrim.startsWith("'")) continue;
              if (reProcStart.test(nextTrim)) isProcComment = true;
              break;
            }
            if (isProcComment) {
              seenProc = true;
              pendingDocLines.push(...remBuffer);
            } else {
              declLines.push(...remBuffer);
            }
          } else {
            pendingDocLines.push(...remBuffer);
          }
          remBuffer = [];
        }
        continue;
      }

      // Inside Class or Type block
      if (blockDepth > 0) {
        declLines.push(line);
        if (reBlockEnd.test(trimmed)) {
          blockDepth--;
        }
        continue;
      }

      if (reBlockStart.test(trimmed)) {
        blockDepth++;
        if (pendingDocLines.length > 0) {
          declLines.push(...pendingDocLines);
          pendingDocLines = [];
        }
        declLines.push(line);
        continue;
      }

      // Option statements
      if (reOption.test(trimmed)) {
        seenOption = true;
        optionsLines.push(line);
        continue;
      }

      // Procedure start (Sub, Function, Property)
      const procMatch = trimmed.match(reProcStart);
      if (procMatch) {
        seenProc = true;
        curProc = {
          name: procMatch[1],
          lines: [...pendingDocLines, line],
        };
        pendingDocLines = [];
        continue;
      }

      // Comment or empty lines
      if (!trimmed || trimmed.startsWith("'")) {
        if (!seenOption) {
          optionsLines.push(line);
        } else if (!seenProc) {
          declLines.push(line);
        } else {
          pendingDocLines.push(line);
        }
        continue;
      }

      // Module-level declarations (Const, Dim, etc.)
      if (!seenProc) {
        if (pendingDocLines.length > 0) {
          declLines.push(...pendingDocLines);
          pendingDocLines = [];
        }
        declLines.push(line);
      } else {
        // Unexpected non-proc line after first proc: keep with pending
        pendingDocLines.push(line);
      }
    }

    if (curProc) {
      throw new Error(`Procedure '${(curProc as any).name}' has no matching End Sub / End Function.`);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const order: { fileName: string; content: string }[] = [];

    // 00_options.lss
    const optionsText = optionsLines.join("\n").trim();
    if (optionsText) {
      order.push({ fileName: "00_options.lss", content: optionsText + "\n" });
    }

    // 01_declarations.lss
    const declText = declLines.join("\n").trim();
    if (declText) {
      order.push({ fileName: "01_declarations.lss", content: declText + "\n" });
    }

    // Custom procedures (subs, functions, props)
    const customProcs = procs.filter((p) => p.kind === "procedure");
    for (const p of customProcs) {
      const content = [
        `' @script-member-of: ${scriptName}`,
        `' @procedure: ${p.name}`,
        `' @parent-declarations: 01_declarations.lss`,
        "",
        p.lines.join("\n").trim(),
        "",
      ].join("\n");
      order.push({ fileName: p.fileName, content });
    }

    // 99_initialize.lss
    const initProc = procs.find((p) => p.kind === "initialize");
    if (initProc) {
      order.push({ fileName: initProc.fileName, content: initProc.lines.join("\n").trim() + "\n" });
    }

    // 99_terminate.lss
    const termProc = procs.find((p) => p.kind === "terminate");
    if (termProc) {
      order.push({ fileName: termProc.fileName, content: termProc.lines.join("\n").trim() + "\n" });
    }

    // Write all files
    for (const item of order) {
      fs.writeFileSync(path.join(targetDir, item.fileName), item.content, "utf-8");
    }

    const relativeSource = path.relative(targetDir, resolvedLss).replace(/\\/g, "/");
    const timestampIso = new Date().toISOString();

    // Write manifest.json
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

    // Write main.lss
    const mainLssLines = [
      `' @script-root: ${scriptName}`,
      `' @source-file: ${relativeSource}`,
      `' @decompile-timestamp: ${timestampIso}`,
      `'`,
      `' Synthetic virtual imports for PI skill & developer navigation:`,
      ...order.map((o) => `' %pi-import "${o.fileName}"`),
      "",
    ];

    fs.writeFileSync(path.join(targetDir, "main.lss"), mainLssLines.join("\n"), "utf-8");

    return targetDir;
  }

  /**
   * Decompile an Agent DXL file into a modular folder structure.
   */
  static decompileDxl(dxlPath: string, outputDirOverride?: string): string | null {
    const resolvedDxl = path.resolve(dxlPath);
    if (!fs.existsSync(resolvedDxl)) {
      throw new Error(`DXL file not found: ${resolvedDxl}`);
    }

    const content = fs.readFileSync(resolvedDxl, "utf-8");

    // Check if file is an agent
    if (!/<agent\b/i.test(content) && !/<!DOCTYPE\s+agent\b/i.test(content)) {
      return null;
    }

    // Extract agent name
    const agentNameMatch = content.match(/<agent\s+[^>]*name='([^']+)'/i);
    const rawAgentName = agentNameMatch ? agentNameMatch[1] : path.basename(resolvedDxl, ".dxl");

    // Determine target folder
    const dxlDir = path.dirname(resolvedDxl);
    const dxlBaseName = path.basename(resolvedDxl, ".dxl");
    const targetDir = outputDirOverride ? path.resolve(outputDirOverride) : path.join(dxlDir, dxlBaseName);

    // Extract all <code event='...'><lotusscript>...</lotusscript></code> blocks
    const codeRegex = /<code\s+event='([^']+)'[^>]*>\s*<lotusscript>([\s\S]*?)<\/lotusscript>\s*<\/code>/gi;
    const blocks: CodeBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = codeRegex.exec(content)) !== null) {
      const event = match[1];
      const rawCode = match[2];
      const code = decodeXml(rawCode).trim();
      const evLower = event.toLowerCase();

      let kind: CodeBlock["kind"] = "procedure";
      let fileName = "";

      if (evLower === "options") {
        kind = "options";
        fileName = "00_options.lss";
      } else if (evLower === "declarations") {
        kind = "declarations";
        fileName = "01_declarations.lss";
      } else if (evLower === "initialize") {
        kind = "initialize";
        fileName = "99_initialize.lss";
      } else if (evLower === "terminate") {
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

    if (blocks.length === 0) {
      // Agent has no LotusScript (might be formula or simple action agent)
      return null;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Strict compilation order:
    // 1. options
    // 2. declarations (types, classes, globals)
    // 3. custom procedures (subs, functions)
    // 4. initialize
    // 5. terminate
    const order: CodeBlock[] = [];
    const options = blocks.filter((b) => b.kind === "options");
    const decls = blocks.filter((b) => b.kind === "declarations");
    const procs = blocks.filter((b) => b.kind === "procedure");
    const inits = blocks.filter((b) => b.kind === "initialize");
    const terms = blocks.filter((b) => b.kind === "terminate");

    order.push(...options, ...decls, ...procs, ...inits, ...terms);

    const relativeDxl = path.relative(targetDir, resolvedDxl).replace(/\\/g, "/");
    const timestampIso = new Date().toISOString();

    // Write individual modular files
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

    // Write manifest.json
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

    // Write main.lss with synthetic virtual imports
    const mainLssLines = [
      `' @agent-root: ${rawAgentName}`,
      `' @source-dxl: ${relativeDxl}`,
      `' @decompile-timestamp: ${timestampIso}`,
      `'`,
      `' Synthetic virtual imports for PI skill & developer navigation:`,
      ...order.map((b) => `' %pi-import "${b.fileName}"`),
      "",
    ];

    fs.writeFileSync(path.join(targetDir, "main.lss"), mainLssLines.join("\n"), "utf-8");

    return targetDir;
  }

  /**
   * Compile modular agent files back into a single deployable .lss file.
   * Output filename: <agent_name>_<timestamp>_compiled.lss
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

    // Filter candidate lss files (exclude compiled and main.lss)
    const lssFiles = files.filter(
      (f) =>
        f.endsWith(".lss") &&
        f !== "main.lss" &&
        !f.endsWith("_compiled.lss") &&
        !/_compiled\.lss$/i.test(f)
    );

    // Retain existing valid items that still exist on disk
    const updatedOrder: string[] = [];
    for (const f of manifest.compilationOrder) {
      if (lssFiles.includes(f) && !updatedOrder.includes(f)) {
        updatedOrder.push(f);
      }
    }

    // Identify newly added files
    const newFiles = lssFiles.filter((f) => !updatedOrder.includes(f));

    // Sort/insert new files according to role
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
        // Procedure file: insert before 99_initialize.lss if present, else before 99_terminate.lss, else at end
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

    // Also update main.lss virtual imports
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

    // Sync manifest first to detect any new or removed files
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

      // Strip synthetic metadata header comments if present
      content = content.replace(/^'(?: @agent-member-of:| @script-member-of:| @event:| @procedure:| @parent-declarations:)[^\r\n]*\r?\n?/gm, "").trim();

      lines.push(`' === SECTION: ${fileName} ===`);
      lines.push(content);
      lines.push(`' === END SECTION: ${fileName} ===\n`);
    }

    const compiledContent = lines.join("\n");
    fs.writeFileSync(canonicalOutPath, compiledContent, "utf-8");

    // Overwrite original .lss file if requested and source was .lss (never overwrite .dxl)
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

/**
 * Find root directory of a modular script (the one containing manifest.json).
 */
export function findModularRoot(filePath: string): string | null {
  let cur = path.resolve(filePath);
  if (!fs.existsSync(cur)) return null;
  if (fs.statSync(cur).isFile()) {
    cur = path.dirname(cur);
  }
  while (cur && cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, "manifest.json")) && fs.existsSync(path.join(cur, "main.lss"))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return null;
}

/**
 * Check if a file has an existing decompiled modular directory alongside it.
 */
export function getExistingModularDir(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".lss" && ext !== ".dxl") return null;
  const baseName = path.basename(resolved, ext);
  const potentialModularDir = path.join(path.dirname(resolved), baseName);
  if (
    fs.existsSync(potentialModularDir) &&
    fs.existsSync(path.join(potentialModularDir, "manifest.json")) &&
    fs.existsSync(path.join(potentialModularDir, "main.lss"))
  ) {
    return potentialModularDir;
  }
  return null;
}

/**
 * Check if a file is a monolithic .lss file (outside modular folder, contains LotusScript code).
 */
export function isMonolithicLss(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  if (!resolved.toLowerCase().endsWith(".lss")) return false;
  if (resolved.toLowerCase().endsWith("_compiled.lss")) return false;
  if (path.basename(resolved).toLowerCase() === "main.lss") return false;

  if (findModularRoot(resolved)) return false;
  if (getExistingModularDir(resolved)) return false;

  const content = fs.readFileSync(resolved, "utf-8");
  const procs = content.match(/^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+\w+/gim) || [];
  const lineCount = content.split(/\r?\n/).length;
  return (procs.length >= 2) || (procs.length >= 1 && lineCount > 20);
}

/**
 * Check if a file is a monolithic .dxl agent (outside modular folder, contains code event blocks).
 */
export function isMonolithicDxl(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  if (!resolved.toLowerCase().endsWith(".dxl")) return false;

  if (findModularRoot(resolved)) return false;
  if (getExistingModularDir(resolved)) return false;

  const content = fs.readFileSync(resolved, "utf-8");
  return /<code\s+event=['"](?:options|declarations|initialize|action|terminate)/i.test(content);
}

// ---------------- CLI Entrypoint ----------------

function printHelp(): void {
  console.log("Usage: agent-parser <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  decompile <path-to-agent.dxl | path-to-script.lss | directory> [output-dir]");
  console.log("      Extracts LotusScript code into modular folder with manifest.json and main.lss");
  console.log("");
  console.log("  compile <path-to-agent-folder | manifest.json>");
  console.log("      Assembles modular files into <agent_name>_<timestamp>_compiled.lss");
  console.log("");
  console.log("Examples:");
  console.log("  npx tsx tools/agent-parser.ts decompile databaze/my_db/Code/Agents/Foo.dxl");
  console.log("  npx tsx tools/agent-parser.ts decompile ExportLN.lss d:/test");
  console.log("  npx tsx tools/agent-parser.ts compile databaze/my_db/Code/Agents/Foo");
}

function processDirectoryDecompile(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDirectoryDecompile(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".dxl") {
        try {
          const res = AgentParser.decompileDxl(fullPath);
          if (res) {
            console.log(`[DECOMPILED DXL] ${path.relative(process.cwd(), fullPath)} -> ${path.relative(process.cwd(), res)}`);
          }
        } catch (err: any) {
          console.error(`[ERROR] ${fullPath}: ${err.message}`);
        }
      }
    }
  }
}

import { fileURLToPath } from "node:url";

const isEntry = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]));
if (isEntry) {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1];
  const outputDir = args[2];

  if (!command || !target || command === "--help" || command === "-h") {
    printHelp();
    process.exit(1);
  }

  if (command === "decompile") {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      processDirectoryDecompile(target);
    } else if (target.toLowerCase().endsWith(".lss")) {
      const res = AgentParser.decompileLss(target, outputDir);
      console.log(`Decompiled LSS successfully to: ${res}`);
    } else {
      const res = AgentParser.decompileDxl(target, outputDir);
      if (res) {
        console.log(`Decompiled DXL successfully to: ${res}`);
      } else {
        console.log(`No LotusScript agent found in: ${target}`);
      }
    }
  } else if (command === "compile") {
    const out = AgentParser.compileAgent(target);
    console.log(`Compiled successfully: ${out}`);
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
