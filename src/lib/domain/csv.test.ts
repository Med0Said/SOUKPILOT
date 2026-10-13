import { describe, expect, it } from "vitest";
import { decodeCsvBytes, detectDelimiter, escapeFormula, parseCsv, toCsv } from "./csv";

describe("decodeCsvBytes", () => {
  it("decodes UTF-8 and strips the BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("nom;prix\nRobe d'été;45")]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "nom;prix\nRobe d'été;45", encoding: "utf-8" });
  });

  it("falls back to Windows-1252 for Excel ANSI files", () => {
    // "été" in Windows-1252: e9 74 e9
    const bytes = new Uint8Array([0x65, 0x74, 0xe9, 0x3b, 0xe9, 0x74, 0xe9]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "eté;été", encoding: "windows-1252" });
  });
});

describe("detectDelimiter", () => {
  it.each([
    ["nom;prix;sku\na;b;c", ";"],
    ["nom,prix,sku\n", ","],
    ["nom\tprix\tsku", "\t"],
    ['"a;b",prix,sku', ","],
  ])("detects %j", (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected);
  });
});

describe("parseCsv", () => {
  it("parses quotes, escaped quotes, embedded delimiters and newlines", () => {
    const text = 'nom;description;prix\r\n"Sac ""cuir""";"Grand; noir\nneuf";89,000\r\n';
    expect(parseCsv(text, ";")).toEqual([
      ["nom", "description", "prix"],
      ['Sac "cuir"', "Grand; noir\nneuf", "89,000"],
    ]);
  });

  it("keeps empty cells and handles a missing trailing newline", () => {
    expect(parseCsv("a;;c\n;;", ";")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('a;"b\n', ";")).toThrow("unterminated_quote");
  });
});

describe("toCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [
      ["nom", "note"],
      ['Sac "cuir"', "a;b\nc"],
    ];
    expect(parseCsv(toCsv(rows), ";")).toEqual(rows);
  });

  it("neutralizes formula injection", () => {
    expect(escapeFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(escapeFormula("-5")).toBe("'-5");
    expect(escapeFormula("Robe")).toBe("Robe");
  });
});
