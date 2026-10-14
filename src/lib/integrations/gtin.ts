/** GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) helpers — pure, shared with the browser. */

export function normalizeGtin(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** True when `code` is 8, 12, 13 or 14 digits with a valid check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  // Weights 3,1,3,1… from the rightmost data digit.
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
