#!/usr/bin/env node
/**
 * Unused UI strings (CONSTRAINTS.md): every string in the French dictionaries
 * (src/i18n/fr.ts, src/i18n/fr-errors.ts) must be read somewhere in the app.
 * Uses the TypeScript language service, so aliases (`const t = fr.catalog;
 * t.title`) count. A map read by a dynamic key (`fr.roles[role]`), or handed
 * over whole (`options={fr.lists.sorts.sales}`), counts for all its entries.
 * Exit 0 = none unused, 1 = unused strings, 2 = could not run.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DICTIONARIES = ["src/i18n/fr.ts", "src/i18n/fr-errors.ts"];
const slash = (p) => p.replace(/\\/g, "/");

try {
  const ts = createRequire(import.meta.url)("typescript");
  const cfg = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  const service = ts.createLanguageService({
    getScriptFileNames: () => cfg.fileNames,
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) => (existsSync(f) ? ts.ScriptSnapshot.fromString(readFileSync(f, "utf8")) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  });
  const program = service.getProgram();

  // A reference that reads the whole object rather than one named entry:
  // indexed (`x.status[k]`), passed, returned or stored in another object.
  // `const t = x.catalog` is not: the language service follows that alias.
  const readsWhole = (ref) => {
    const file = program.getSourceFile(ref.fileName);
    let node = file && ts.getTokenAtPosition(file, ref.textSpan.start);
    if (!node) return false;
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) node = node.parent;
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return false;
    if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) && parent.name === node) return false;
    return !ts.isPropertySignature(parent);
  };

  const unused = [];
  for (const rel of DICTIONARIES) {
    const fileName = slash(path.join(root, rel));
    const source = program.getSourceFile(fileName);
    if (!source) throw new Error(`${rel} is not part of the TypeScript project`);
    const refsOf = (name) =>
      (service.getReferencesAtPosition(fileName, name.getStart()) ?? []).filter(
        (r) => slash(r.fileName) !== fileName || r.textSpan.start !== name.getStart(),
      );
    const walk = (object, prefix, coveredByParent) => {
      for (const p of object.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const key = `${prefix}.${p.name.getText(source).replace(/^["']|["']$/g, "")}`;
        const refs = refsOf(p.name);
        if (ts.isObjectLiteralExpression(p.initializer)) {
          walk(p.initializer, key, coveredByParent || refs.some(readsWhole));
        } else if (!coveredByParent && refs.length === 0) {
          unused.push(`${rel}:${source.getLineAndCharacterOfPosition(p.getStart()).line + 1} ${key}`);
        }
      }
    };
    ts.forEachChild(source, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        let init = node.initializer;
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
        if (ts.isObjectLiteralExpression(init)) walk(init, node.name.getText(source), false);
      }
      ts.forEachChild(node, visit);
    });
  }

  if (unused.length === 0) {
    console.log("i18n-unused: every dictionary string is used");
    process.exit(0);
  }
  console.error(`i18n-unused: ${unused.length} string(s) never read by the app:`);
  for (const u of unused) console.error("  " + u);
  console.error("\nDelete them, or use them where they were meant to be shown.");
  process.exit(1);
} catch (e) {
  console.error("i18n-unused: could not run: " + (e instanceof Error ? e.message : String(e)));
  process.exit(2);
}
