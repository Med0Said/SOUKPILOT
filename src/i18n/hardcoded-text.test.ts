import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Screen text lives in the dictionary (src/i18n): no words written directly
 * in JSX, nor in accessible-name attributes. The brand name is drawn by the
 * logo, and the test-only fault page is never shown to users.
 */
const ALLOWED = new Set(["src/components/brand/logo.tsx", "src/app/app/test-fault/page.tsx"]);
const NAMED_ATTRIBUTES = /^(aria-label|title|placeholder|alt|label)$/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full.split(path.sep).join("/"));
  }
  return out;
}

function hardCoded(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  (function visit(node: ts.Node) {
    if (ts.isJsxText(node) && /\p{L}{2,}/u.test(node.text)) found.push(`${at(node)} ${node.text.trim()}`);
    if (
      ts.isJsxAttribute(node) &&
      NAMED_ATTRIBUTES.test(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /\p{L}{3,}/u.test(node.initializer.text)
    ) {
      found.push(`${at(node)} ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  })(source);
  return found;
}

describe("hard-coded screen text", () => {
  const files = tsxFiles("src").filter((f) => !ALLOWED.has(f));

  it("scans the components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds none outside the dictionary", () => {
    expect(files.flatMap(hardCoded)).toEqual([]);
  });
});
