/**
 * Minimal RFC 4180 CSV reader/writer tuned for files produced by Excel and
 * LibreOffice in French locales (";" separator, UTF-8 with BOM or
 * Windows-1252).
 */

export type DecodedText = { text: string; encoding: "utf-8" | "windows-1252" };

/** Decodes uploaded bytes: UTF-8 (BOM stripped) or, if invalid, Windows-1252. */
export function decodeCsvBytes(bytes: Uint8Array): DecodedText {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    // Excel "CSV (séparateur : point-virgule)" on Windows saves in Windows-1252.
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Picks the delimiter that occurs most often (outside quotes) in the header line. */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch as keyof typeof counts]++;
  }
  if (counts["\t"] > counts[";"] && counts["\t"] > counts[","]) return "\t";
  return counts[","] > counts[";"] ? "," : ";";
}

/**
 * Parses CSV text into rows of cells. Handles quoted cells, doubled quotes,
 * delimiters and line breaks inside quotes, CRLF/LF, and a trailing newline.
 * Throws on an unterminated quoted cell.
 */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      cell += ch;
      i++;
    }
  }
  if (inQuotes) throw new Error("unterminated_quote");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Neutralizes spreadsheet formula injection (CSV injection): a cell that
 * starts with = + - @ or a control character is prefixed with an apostrophe.
 */
export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * A cell known to hold a number ("-12,500", "42"): written without the
 * formula guard so spreadsheets read it as a number, not text. Anything that
 * is not strictly a decimal number is still escaped.
 */
export type CsvNumber = { readonly numeric: string };
export type CsvCell = string | number | CsvNumber;

export function csvNumber(value: string | number): CsvNumber {
  return { numeric: String(value) };
}

const DECIMAL = /^-?\d+([.,]\d+)?$/;

function cellText(cell: CsvCell): string {
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "object") return DECIMAL.test(cell.numeric) ? cell.numeric : escapeFormula(cell.numeric);
  return escapeFormula(cell);
}

/** Serializes rows; quotes cells containing the delimiter, quotes or newlines. */
export function toCsv(rows: readonly (readonly CsvCell[])[], delimiter = ";"): string {
  return rows
    .map((row) =>
      row
        .map((raw) => {
          const value = cellText(raw);
          return /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(delimiter),
    )
    .join("\r\n");
}
