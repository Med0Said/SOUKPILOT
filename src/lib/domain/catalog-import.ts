/**
 * CSV catalog import: header mapping, row validation, grouping rows into
 * products with variants, and duplicate/conflict detection.
 *
 * Pure function (no I/O) so it is fully unit-tested. The server action feeds
 * it the decoded file text and the identifiers that already exist in the
 * database; the database re-checks every constraint when committing.
 *
 * Rules
 *  - One row = one variant. Rows with the same product name (case-insensitive)
 *    form one product. Product-level fields come from the first row; a later
 *    row that contradicts them is an error.
 *  - Options: either "option1_nom/option1_valeur" pairs or direct columns such
 *    as "Taille", "Couleur", "Teinte" (max 3 options in total).
 *  - SKU/barcode duplicated inside the file: every occurrence is an error.
 *  - SKU/barcode/product name that already exists in the shop: error (the
 *    import never merges into existing products).
 *  - If any row of a product is invalid, the whole product is skipped, so a
 *    product is never imported with missing variants.
 */
import { decodeCsvBytes, detectDelimiter, parseCsv } from "./csv";
import { parseTnd } from "./money";
import {
  BARCODE_PATTERN,
  LIMITS,
  cleanOptional,
  cleanText,
  optionsKey,
  parseYesNo,
  type ImportProductPayload,
} from "./catalog";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type Field =
  | "name"
  | "category"
  | "description"
  | "supplier"
  | "sku"
  | "barcode"
  | "price"
  | "cost"
  | "track_stock"
  | "low_stock_threshold"
  | "option1_name"
  | "option1_value"
  | "option2_name"
  | "option2_value"
  | "option3_name"
  | "option3_value";

const ALIASES: Record<Field, readonly string[]> = {
  name: ["nom", "nom_article", "nom_du_produit", "nom_produit", "article", "produit", "designation", "libelle", "name"],
  category: ["categorie", "famille", "rayon", "category"],
  description: ["description", "descriptif"],
  supplier: ["fournisseur", "supplier"],
  sku: ["sku", "reference", "ref", "reference_interne", "code_article"],
  barcode: ["code_barres", "code_barre", "codebarre", "codebarres", "ean", "ean13", "gtin", "barcode"],
  price: ["prix_vente", "prix_de_vente", "prix", "pv", "prix_ttc", "price"],
  cost: ["prix_achat", "prix_d_achat", "pa", "cout", "cout_achat", "cout_unitaire", "cost"],
  track_stock: ["suivi_stock", "suivi_du_stock", "stock_suivi", "gerer_stock"],
  low_stock_threshold: ["seuil_alerte", "seuil", "stock_min", "stock_minimum", "alerte_stock"],
  option1_name: ["option1_nom", "option_1_nom"],
  option1_value: ["option1_valeur", "option_1_valeur"],
  option2_name: ["option2_nom", "option_2_nom"],
  option2_value: ["option2_valeur", "option_2_valeur"],
  option3_name: ["option3_nom", "option_3_nom"],
  option3_value: ["option3_valeur", "option_3_valeur"],
};

/** Headers recognized as an option column whose NAME is the header itself. */
const DIRECT_OPTION_HEADERS = new Set([
  "taille",
  "couleur",
  "coloris",
  "pointure",
  "teinte",
  "parfum",
  "contenance",
  "matiere",
  "modele",
  "format",
]);

export const TEMPLATE_HEADERS = [
  "nom",
  "categorie",
  "fournisseur",
  "description",
  "option1_nom",
  "option1_valeur",
  "option2_nom",
  "option2_valeur",
  "sku",
  "code_barres",
  "prix_vente",
  "prix_achat",
  "suivi_stock",
  "seuil_alerte",
] as const;

export const TEMPLATE_EXAMPLE_ROWS: readonly (readonly string[])[] = [
  ["T-shirt col V", "Vêtements", "Atelier Nabeul", "Coton 100 %", "Taille", "S", "Couleur", "Noir", "TSV-S-NOIR", "", "25,000", "12,500", "oui", "2"],
  ["T-shirt col V", "Vêtements", "Atelier Nabeul", "Coton 100 %", "Taille", "M", "Couleur", "Noir", "TSV-M-NOIR", "", "25,000", "12,500", "oui", "2"],
  ["Rouge à lèvres mat", "Maquillage", "", "", "Teinte", "Rose", "", "", "RAL-ROSE", "6190000000011", "18,500", "9,000", "oui", ""],
];

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type RowReport = {
  /** Line number in the file (header = line 1). */
  line: number;
  productName: string;
  variantLabel: string;
  status: "ok" | "error" | "skipped";
  messages: string[];
};

export type ImportAnalysis = {
  fatalErrors: string[];
  warnings: string[];
  encoding: "utf-8" | "windows-1252" | null;
  rows: RowReport[];
  products: ImportProductPayload[];
  summary: { totalRows: number; okRows: number; errorRows: number; skippedRows: number; products: number; variants: number };
};

export type ExistingIdentifiers = {
  /** Lower-case product names already in the shop. */
  names: ReadonlySet<string>;
  /** Upper-case SKUs already in the shop. */
  skus: ReadonlySet<string>;
  barcodes: ReadonlySet<string>;
};

export const NO_EXISTING: ExistingIdentifiers = { names: new Set(), skus: new Set(), barcodes: new Set() };

type ColumnMap = {
  fields: Partial<Record<Field, number>>;
  directOptions: { name: string; index: number }[];
};

function mapColumns(headers: string[]): { map: ColumnMap; fatal: string[]; warnings: string[] } {
  const fields: Partial<Record<Field, number>> = {};
  const directOptions: { name: string; index: number }[] = [];
  const fatal: string[] = [];
  const warnings: string[] = [];

  headers.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    if (key === "") return;
    const field = (Object.keys(ALIASES) as Field[]).find((f) => ALIASES[f].includes(key));
    if (field) {
      if (fields[field] !== undefined) fatal.push(`La colonne « ${cleanText(raw)} » apparaît deux fois.`);
      else fields[field] = index;
    } else if (DIRECT_OPTION_HEADERS.has(key)) {
      directOptions.push({ name: cleanText(raw).replace(/^./, (c) => c.toUpperCase()), index });
    } else {
      warnings.push(`Colonne « ${cleanText(raw)} » non reconnue : ignorée.`);
    }
  });

  if (fields.name === undefined) fatal.push("Colonne obligatoire manquante : « nom ».");
  if (fields.price === undefined) fatal.push("Colonne obligatoire manquante : « prix_vente ».");
  const pairCount = [1, 2, 3].filter((n) => fields[`option${n}_name` as Field] !== undefined).length;
  if (pairCount + directOptions.length > LIMITS.maxOptions) {
    fatal.push(`Trop d'options : ${LIMITS.maxOptions} au maximum (ex. Taille, Couleur, Teinte).`);
  }
  return { map: { fields, directOptions }, fatal, warnings };
}

type ParsedRow = {
  line: number;
  name: string;
  nameKey: string;
  category: string | null;
  supplier: string | null;
  description: string | null;
  optionNames: string[];
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cost: number | null;
  trackStock: boolean;
  threshold: number | null;
  errors: string[];
};

function parseRow(cells: string[], line: number, map: ColumnMap): ParsedRow {
  const get = (field: Field) => {
    const index = map.fields[field];
    return index === undefined ? "" : (cells[index] ?? "");
  };
  const errors: string[] = [];

  const name = cleanText(get("name"));
  if (name === "") errors.push("Nom obligatoire.");
  else if (name.length > LIMITS.productName) errors.push(`Nom trop long (${LIMITS.productName} caractères max).`);

  const category = cleanOptional(get("category"));
  if (category && category.length > LIMITS.categoryName) errors.push("Catégorie trop longue.");
  const supplier = cleanOptional(get("supplier"));
  if (supplier && supplier.length > LIMITS.supplierName) errors.push("Nom de fournisseur trop long.");
  const description = cleanOptional(get("description"));
  if (description && description.length > LIMITS.description) errors.push("Description trop longue.");

  const optionNames: string[] = [];
  const optionValues: string[] = [];
  for (const n of [1, 2, 3]) {
    const optName = cleanText(get(`option${n}_name` as Field));
    const optValue = cleanText(get(`option${n}_value` as Field));
    if (optName === "" && optValue === "") continue;
    if (optName === "") errors.push(`Valeur d'option ${n} sans nom d'option.`);
    else if (optValue === "") errors.push(`Option « ${optName} » sans valeur.`);
    else {
      optionNames.push(optName);
      optionValues.push(optValue);
    }
  }
  for (const direct of map.directOptions) {
    const value = cleanText(cells[direct.index] ?? "");
    if (value !== "") {
      optionNames.push(direct.name);
      optionValues.push(value);
    }
  }
  if (optionNames.some((o) => o.length > LIMITS.optionName)) errors.push("Nom d'option trop long.");
  if (optionValues.some((v) => v.length > LIMITS.optionValue)) errors.push("Valeur d'option trop longue.");
  if (new Set(optionNames.map((o) => o.toLowerCase())).size !== optionNames.length) {
    errors.push("Le même nom d'option est utilisé deux fois.");
  }

  const sku = cleanOptional(get("sku"));
  if (sku && sku.length > LIMITS.sku) errors.push(`SKU trop long (${LIMITS.sku} caractères max).`);
  const barcode = cleanOptional(get("barcode"))?.replace(/\s/g, "") ?? null;
  if (barcode && !BARCODE_PATTERN.test(barcode)) errors.push("Code-barres invalide (chiffres, lettres, « . » ou « - »).");

  let price: number | null = null;
  const priceResult = parseTnd(get("price"));
  if (priceResult.ok) price = priceResult.millimes;
  else errors.push(`Prix de vente : ${priceResult.error}`);

  let cost: number | null = null;
  if (cleanText(get("cost")) !== "") {
    const costResult = parseTnd(get("cost"));
    if (costResult.ok) cost = costResult.millimes;
    else errors.push(`Prix d'achat : ${costResult.error}`);
  }

  const track = parseYesNo(get("track_stock"), true);
  if (track === null) errors.push("Suivi du stock : utilisez « oui » ou « non ».");

  let threshold: number | null = null;
  const rawThreshold = cleanText(get("low_stock_threshold"));
  if (rawThreshold !== "") {
    if (/^\d+$/.test(rawThreshold) && Number(rawThreshold) <= LIMITS.maxThreshold) threshold = Number(rawThreshold);
    else errors.push("Seuil d'alerte : nombre entier positif attendu.");
  }

  return {
    line,
    name,
    nameKey: name.toLowerCase(),
    category,
    supplier,
    description,
    optionNames,
    optionValues,
    sku,
    barcode,
    price,
    cost,
    trackStock: track ?? true,
    threshold,
    errors,
  };
}

function emptyAnalysis(fatalErrors: string[], encoding: ImportAnalysis["encoding"] = null): ImportAnalysis {
  return {
    fatalErrors,
    warnings: [],
    encoding,
    rows: [],
    products: [],
    summary: { totalRows: 0, okRows: 0, errorRows: 0, skippedRows: 0, products: 0, variants: 0 },
  };
}

/** Decodes and analyzes an uploaded file. */
export function analyzeImportFile(bytes: Uint8Array, existing: ExistingIdentifiers = NO_EXISTING): ImportAnalysis {
  if (bytes.byteLength === 0) return emptyAnalysis(["Le fichier est vide."]);
  if (bytes.byteLength > MAX_IMPORT_BYTES) return emptyAnalysis(["Fichier trop volumineux (2 Mo maximum)."]);
  const { text, encoding } = decodeCsvBytes(bytes);
  const analysis = analyzeImportText(text, existing);
  analysis.encoding = encoding;
  if (encoding === "windows-1252") {
    analysis.warnings.unshift(
      "Le fichier n'est pas en UTF-8 : il a été lu en Windows-1252 (Excel). Vérifiez les accents dans l'aperçu.",
    );
  }
  return analysis;
}

export function analyzeImportText(text: string, existing: ExistingIdentifiers = NO_EXISTING): ImportAnalysis {
  let table: string[][];
  try {
    table = parseCsv(text, detectDelimiter(text));
  } catch {
    return emptyAnalysis(["Fichier CSV mal formé : un guillemet n'est pas fermé."]);
  }
  table = table.filter((cells) => cells.some((c) => c.trim() !== ""));
  if (table.length < 2) return emptyAnalysis(["Le fichier ne contient aucune ligne d'article."]);
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return emptyAnalysis([`Trop de lignes : ${MAX_IMPORT_ROWS} au maximum par import.`]);
  }

  const { map, fatal, warnings } = mapColumns(table[0]);
  if (fatal.length > 0) return { ...emptyAnalysis(fatal), warnings };

  const parsed = table.slice(1).map((cells, i) => parseRow(cells, i + 2, map));

  // Duplicate SKUs / barcodes inside the file: flag every occurrence.
  const countBy = (values: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    return counts;
  };
  const skuCounts = countBy(parsed.map((r) => r.sku?.toUpperCase() ?? null));
  const barcodeCounts = countBy(parsed.map((r) => r.barcode));
  for (const row of parsed) {
    if (row.sku && (skuCounts.get(row.sku.toUpperCase()) ?? 0) > 1) row.errors.push(`SKU « ${row.sku} » en double dans le fichier.`);
    if (row.barcode && (barcodeCounts.get(row.barcode) ?? 0) > 1) {
      row.errors.push(`Code-barres « ${row.barcode} » en double dans le fichier.`);
    }
    if (row.sku && existing.skus.has(row.sku.toUpperCase())) row.errors.push(`SKU « ${row.sku} » déjà utilisé dans la boutique.`);
    if (row.barcode && existing.barcodes.has(row.barcode)) {
      row.errors.push(`Code-barres « ${row.barcode} » déjà utilisé dans la boutique.`);
    }
    if (row.name && existing.names.has(row.nameKey)) {
      row.errors.push("Un article portant ce nom existe déjà (l'import ne modifie pas les articles existants).");
    }
  }

  // Group rows into products and check consistency against the first row.
  const groups = new Map<string, ParsedRow[]>();
  for (const row of parsed) {
    if (!row.name) continue;
    const group = groups.get(row.nameKey) ?? [];
    group.push(row);
    groups.set(row.nameKey, group);
  }

  const products: ImportProductPayload[] = [];
  const skippedLines = new Set<number>();
  for (const group of groups.values()) {
    const first = group[0];
    const firstOptions = first.optionNames.map((o) => o.toLowerCase()).join("|");
    const seenCombos = new Map<string, number>();
    for (const row of group) {
      if (row !== first) {
        const ref = `ligne ${first.line}`;
        if (row.optionNames.map((o) => o.toLowerCase()).join("|") !== firstOptions) {
          row.errors.push(`Options différentes de la ${ref} pour le même article.`);
        }
        if (row.category && row.category.toLowerCase() !== (first.category ?? "").toLowerCase()) {
          row.errors.push(`Catégorie différente de la ${ref}.`);
        }
        if (row.supplier && row.supplier.toLowerCase() !== (first.supplier ?? "").toLowerCase()) {
          row.errors.push(`Fournisseur différent de la ${ref}.`);
        }
        if (row.description && row.description !== first.description) row.errors.push(`Description différente de la ${ref}.`);
        if (row.trackStock !== first.trackStock) row.errors.push(`Suivi du stock différent de la ${ref}.`);
      }
      if (group.length > 1 && row.optionNames.length === 0) {
        row.errors.push("Plusieurs lignes portent ce nom : précisez une option (ex. Taille) pour chaque variante.");
      }
      const combo = optionsKey(row.optionValues);
      const previous = seenCombos.get(combo);
      if (previous !== undefined) row.errors.push(`Même combinaison d'options que la ligne ${previous}.`);
      else seenCombos.set(combo, row.line);
    }
    if (group.length > LIMITS.maxVariantsPerProduct) {
      first.errors.push(`Trop de variantes (${LIMITS.maxVariantsPerProduct} au maximum par article).`);
    }

    if (group.some((r) => r.errors.length > 0)) {
      for (const r of group) if (r.errors.length === 0) skippedLines.add(r.line);
      continue;
    }
    products.push({
      name: first.name,
      description: first.description,
      category_name: first.category,
      supplier_name: first.supplier,
      option_names: first.optionNames,
      track_stock: first.trackStock,
      variants: group.map((r) => ({
        sku: r.sku,
        barcode: r.barcode,
        option_values: r.optionValues,
        price_millimes: r.price as number,
        cost_millimes: r.cost,
        low_stock_threshold: r.threshold,
      })),
    });
  }

  const rows: RowReport[] = parsed.map((r) => ({
    line: r.line,
    productName: r.name,
    variantLabel: r.optionValues.length ? r.optionValues.join(" / ") : "Unique",
    status: r.errors.length > 0 ? "error" : skippedLines.has(r.line) ? "skipped" : "ok",
    messages:
      r.errors.length > 0
        ? r.errors
        : skippedLines.has(r.line)
          ? ["Non importée : une autre ligne du même article contient une erreur."]
          : [],
  }));

  return {
    fatalErrors: [],
    warnings,
    encoding: null,
    rows,
    products,
    summary: {
      totalRows: rows.length,
      okRows: rows.filter((r) => r.status === "ok").length,
      errorRows: rows.filter((r) => r.status === "error").length,
      skippedRows: rows.filter((r) => r.status === "skipped").length,
      products: products.length,
      variants: products.reduce((n, p) => n + p.variants.length, 0),
    },
  };
}

/**
 * Distinct product names / SKUs / barcodes in the file (all rows, valid or
 * not), so the server can ask the database which ones already exist.
 */
export function identifiersToCheck(text: string): { names: string[]; skus: string[]; barcodes: string[] } {
  const empty = { names: [], skus: [], barcodes: [] };
  let table: string[][];
  try {
    table = parseCsv(text, detectDelimiter(text)).filter((cells) => cells.some((c) => c.trim() !== ""));
  } catch {
    return empty;
  }
  if (table.length < 2) return empty;
  const { map, fatal } = mapColumns(table[0]);
  if (fatal.length > 0) return empty;
  const names = new Set<string>();
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  table.slice(1, MAX_IMPORT_ROWS + 1).forEach((cells, i) => {
    const row = parseRow(cells, i + 2, map);
    if (row.name) names.add(row.name);
    if (row.sku) skus.add(row.sku);
    if (row.barcode) barcodes.add(row.barcode);
  });
  return { names: [...names], skus: [...skus], barcodes: [...barcodes] };
}
