/**
 * Catalog rules shared by the product form and the CSV import. They mirror the
 * database constraints in supabase/migrations/*_catalog.sql, which remain the
 * authority.
 */

export const LIMITS = {
  productName: 200,
  description: 4000,
  categoryName: 80,
  supplierName: 120,
  optionName: 40,
  optionValue: 60,
  maxOptions: 3,
  sku: 64,
  maxVariantsPerProduct: 200,
  maxThreshold: 1_000_000,
} as const;

export const BARCODE_PATTERN = /^[0-9A-Za-z.-]{1,64}$/;

export type VariantPayload = {
  sku: string | null;
  barcode: string | null;
  option_values: string[];
  price_millimes: number;
  cost_millimes: number | null;
  low_stock_threshold: number | null;
};

export type ProductPayload = {
  name: string;
  description: string | null;
  option_names: string[];
  track_stock: boolean;
  variants: VariantPayload[];
};

export type ImportProductPayload = ProductPayload & {
  category_name: string | null;
  supplier_name: string | null;
};

/** Trims and collapses internal whitespace ("  Robe   d'été " → "Robe d'été"). */
export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s  ]+/g, " ").trim();
}

export function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned === "" ? null : cleaned;
}

/** Case-insensitive key of an option combination, like private.options_key(). */
export function optionsKey(values: readonly string[]): string {
  return values.map((v) => v.toLowerCase()).join("\u001f");
}

/** Human label of a variant: "S / Noir", or "Unique" when there are no options. */
export function variantLabel(optionValues: readonly string[]): string {
  return optionValues.length === 0 ? "Unique" : optionValues.join(" / ");
}

const TRUE_WORDS = new Set(["oui", "o", "yes", "y", "1", "true", "vrai", "x"]);
const FALSE_WORDS = new Set(["non", "n", "no", "0", "false", "faux"]);

/** "oui"/"non"-style booleans; empty → default. Returns null when unrecognized. */
export function parseYesNo(value: string, fallback: boolean): boolean | null {
  const v = cleanText(value).toLowerCase();
  if (v === "") return fallback;
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

/** Cartesian product of option values, used to generate variants in the form. */
export function combinations(valueLists: readonly (readonly string[])[]): string[][] {
  return valueLists.reduce<string[][]>(
    (acc, values) => acc.flatMap((prefix) => values.map((value) => [...prefix, value])),
    [[]],
  );
}
