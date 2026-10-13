/**
 * Money in SoukPilot = integer MILLIMES (1 TND = 1000 millimes).
 *
 * Never use floating point for amounts. Parsing works on the string digits;
 * formatting splits the integer with integer arithmetic only.
 *
 * Accepted input (Tunisian / French habits):
 *   "25"  "25,5"  "25.500"  "25,500 DT"  "1 234,500"  "1.234,500"  "12 TND"
 * Decimal separator rule: the LAST "." or "," is the decimal separator when
 * that character occurs once; if it occurs several times it is a thousands
 * separator ("1.234.500" = 1 234 500 TND). At most 3 decimals (millimes).
 * So "1.234" = 1 TND 234 millimes, never 1 234 TND.
 */
export const MILLIMES_PER_DINAR = 1000;
/** Matches the database CHECK (price_millimes <= 10^12, i.e. 1 000 000 000 TND). */
export const MAX_MILLIMES = 1_000_000_000_000;

export type MoneyParseResult = { ok: true; millimes: number } | { ok: false; error: string };

const CURRENCY_SUFFIX = /\s*(dt|tnd|د\.ت)\s*$/iu;
const SPACES = /[\s  ]/g;

export function parseTnd(input: string): MoneyParseResult {
  let s = (input ?? "").trim().replace(CURRENCY_SUFFIX, "").replace(SPACES, "");
  if (s === "") return { ok: false, error: "Montant obligatoire." };
  if (s.startsWith("-")) return { ok: false, error: "Le montant ne peut pas être négatif." };
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: "Montant invalide." };

  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let integerPart = s;
  let fractionPart = "";
  if (lastSep >= 0) {
    const sepChar = s[lastSep];
    const occurrences = s.split(sepChar).length - 1;
    if (occurrences === 1) {
      integerPart = s.slice(0, lastSep);
      fractionPart = s.slice(lastSep + 1);
      const otherSep = sepChar === "." ? "," : ".";
      if (!validThousands(integerPart, otherSep)) return { ok: false, error: "Montant invalide." };
      integerPart = integerPart.split(otherSep).join("");
    } else {
      if (s.includes(sepChar === "." ? "," : ".")) return { ok: false, error: "Montant invalide." };
      if (!validThousands(s, sepChar)) return { ok: false, error: "Montant invalide." };
      integerPart = s.split(sepChar).join("");
    }
  }

  if (integerPart === "") integerPart = "0";
  if (!/^\d+$/.test(integerPart) || !/^\d{0,3}$/.test(fractionPart)) {
    return { ok: false, error: "Montant invalide (3 décimales au maximum)." };
  }
  if (lastSep >= 0 && fractionPart === "" && s[lastSep] && s.endsWith(s[lastSep])) {
    return { ok: false, error: "Montant invalide." };
  }

  const dinars = Number(integerPart);
  const millimes = Number(fractionPart.padEnd(3, "0"));
  const total = dinars * MILLIMES_PER_DINAR + millimes;
  if (!Number.isSafeInteger(total) || total > MAX_MILLIMES) {
    return { ok: false, error: "Montant trop élevé." };
  }
  return { ok: true, millimes: total };
}

/** "1.234.500" style groups: first group 1–3 digits, then groups of exactly 3. */
function validThousands(value: string, sep: string): boolean {
  if (!value.includes(sep)) return true;
  const groups = value.split(sep);
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

function splitMillimes(millimes: number): { sign: string; dinars: string; fraction: string } {
  if (!Number.isSafeInteger(millimes)) throw new RangeError("Amount must be an integer number of millimes");
  const abs = Math.abs(millimes);
  return {
    sign: millimes < 0 ? "-" : "",
    dinars: String(Math.trunc(abs / MILLIMES_PER_DINAR)),
    fraction: String(abs % MILLIMES_PER_DINAR).padStart(3, "0"),
  };
}

/** Display format: "1 234,500 DT" (narrow no-break space for thousands). */
export function formatTnd(millimes: number): string {
  const { sign, dinars, fraction } = splitMillimes(millimes);
  const grouped = dinars.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${fraction} DT`;
}

/** Value for an editable input: "1234,500" (no grouping, parseable by parseTnd). */
export function formatTndInput(millimes: number | null | undefined): string {
  if (millimes === null || millimes === undefined) return "";
  const { sign, dinars, fraction } = splitMillimes(millimes);
  return `${sign}${dinars},${fraction}`;
}
