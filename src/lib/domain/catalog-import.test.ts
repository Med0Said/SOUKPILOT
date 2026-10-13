import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_EXAMPLE_ROWS,
  TEMPLATE_HEADERS,
  analyzeImportFile,
  analyzeImportText,
  identifiersToCheck,
  normalizeHeader,
} from "./catalog-import";
import { combinations } from "./catalog";

const csv = (rows: string[][]) => toCsv(rows, ";");

describe("normalizeHeader", () => {
  it.each([
    ["Prix d'achat", "prix_d_achat"],
    ["Catégorie", "categorie"],
    ["  CODE-BARRES ", "code_barres"],
    ["Désignation", "designation"],
  ])("%j → %s", (input, expected) => expect(normalizeHeader(input)).toBe(expected));
});

describe("analyzeImportText", () => {
  it("accepts the downloadable template as-is", () => {
    const result = analyzeImportText(toCsv([[...TEMPLATE_HEADERS], ...TEMPLATE_EXAMPLE_ROWS.map((r) => [...r])]));
    expect(result.fatalErrors).toEqual([]);
    expect(result.summary).toMatchObject({ totalRows: 3, okRows: 3, errorRows: 0, products: 2, variants: 3 });
    const tshirt = result.products.find((p) => p.name === "T-shirt col V");
    expect(tshirt).toMatchObject({
      category_name: "Vêtements",
      supplier_name: "Atelier Nabeul",
      option_names: ["Taille", "Couleur"],
      track_stock: true,
    });
    expect(tshirt?.variants.map((v) => [v.option_values, v.price_millimes, v.cost_millimes, v.low_stock_threshold])).toEqual([
      [["S", "Noir"], 25000, 12500, 2],
      [["M", "Noir"], 25000, 12500, 2],
    ]);
  });

  it("understands French column names, direct option columns and comma separators", () => {
    const text = [
      "Désignation,Famille,Taille,Couleur,Référence,EAN,Prix,PA",
      "Robe longue,Robes,S,Rouge,RL-S-R,6191,\"45,500\",20",
      "Robe longue,Robes,M,Rouge,RL-M-R,6192,\"45,500\",20",
    ].join("\n");
    const result = analyzeImportText(text);
    expect(result.fatalErrors).toEqual([]);
    expect(result.products).toEqual([
      {
        name: "Robe longue",
        description: null,
        category_name: "Robes",
        supplier_name: null,
        option_names: ["Taille", "Couleur"],
        track_stock: true,
        variants: [
          { sku: "RL-S-R", barcode: "6191", option_values: ["S", "Rouge"], price_millimes: 45500, cost_millimes: 20000, low_stock_threshold: null },
          { sku: "RL-M-R", barcode: "6192", option_values: ["M", "Rouge"], price_millimes: 45500, cost_millimes: 20000, low_stock_threshold: null },
        ],
      },
    ]);
  });

  it("reports missing required columns as fatal", () => {
    const result = analyzeImportText(csv([["article", "sku"], ["Sac", "S1"]]));
    expect(result.fatalErrors).toEqual(["Colonne obligatoire manquante : « prix_vente »."]);
    expect(result.products).toEqual([]);
  });

  it("warns about unknown columns", () => {
    const result = analyzeImportText(csv([["nom", "prix", "remarque"], ["Sac", "10", "x"]]));
    expect(result.warnings).toEqual(["Colonne « remarque » non reconnue : ignorée."]);
    expect(result.summary.products).toBe(1);
  });

  it("gives row-level errors with file line numbers", () => {
    const result = analyzeImportText(
      [
        "nom;prix_vente;prix_achat;suivi_stock;seuil_alerte;code_barres",
        ";10;;;;",
        "Sac;dix;;;;",
        "Ceinture;10;-2;peut-être;1.5;12 34#",
      ].join("\n"),
    );
    expect(result.rows.map((r) => [r.line, r.status, r.messages])).toEqual([
      [2, "error", ["Nom obligatoire."]],
      [3, "error", ["Prix de vente : Montant invalide."]],
      [
        4,
        "error",
        [
          "Code-barres invalide (chiffres, lettres, « . » ou « - »).",
          "Prix d'achat : Le montant ne peut pas être négatif.",
          "Suivi du stock : utilisez « oui » ou « non ».",
          "Seuil d'alerte : nombre entier positif attendu.",
        ],
      ],
    ]);
    expect(result.products).toEqual([]);
  });

  it("flags every occurrence of a SKU or barcode duplicated in the file", () => {
    const result = analyzeImportText(
      csv([
        ["nom", "prix", "sku", "code_barres"],
        ["Sac A", "10", "dup", "111"],
        ["Sac B", "10", "DUP", "222"],
        ["Sac C", "10", "ok", "222"],
      ]),
    );
    expect(result.rows.map((r) => r.status)).toEqual(["error", "error", "error"]);
    expect(result.rows[0].messages).toEqual(["SKU « dup » en double dans le fichier."]);
    expect(result.rows[2].messages).toEqual(["Code-barres « 222 » en double dans le fichier."]);
  });

  it("never merges into existing products and reports identifier conflicts", () => {
    const result = analyzeImportText(
      csv([
        ["nom", "prix", "sku", "code_barres"],
        ["Sac existant", "10", "", ""],
        ["Nouveau", "10", "old-sku", ""],
        ["Autre", "10", "", "999"],
        ["Libre", "10", "NEW", "123"],
      ]),
      { names: new Set(["sac existant"]), skus: new Set(["OLD-SKU"]), barcodes: new Set(["999"]) },
    );
    expect(result.rows.map((r) => r.status)).toEqual(["error", "error", "error", "ok"]);
    expect(result.products.map((p) => p.name)).toEqual(["Libre"]);
  });

  it("requires options to distinguish rows of the same product, and consistent product fields", () => {
    const result = analyzeImportText(
      csv([
        ["nom", "categorie", "taille", "prix"],
        ["Jean", "Pantalons", "38", "60"],
        ["Jean", "Robes", "40", "60"],
        ["Jean", "", "38", "60"],
        ["Chemise", "", "", "30"],
        ["chemise", "", "", "30"],
      ]),
    );
    expect(result.rows.map((r) => [r.line, r.status, r.messages])).toEqual([
      [2, "skipped", ["Non importée : une autre ligne du même article contient une erreur."]],
      [3, "error", ["Catégorie différente de la ligne 2."]],
      [4, "error", ["Même combinaison d'options que la ligne 2."]],
      [5, "error", ["Plusieurs lignes portent ce nom : précisez une option (ex. Taille) pour chaque variante."]],
      [
        6,
        "error",
        [
          "Plusieurs lignes portent ce nom : précisez une option (ex. Taille) pour chaque variante.",
          "Même combinaison d'options que la ligne 5.",
        ],
      ],
    ]);
    expect(result.products).toEqual([]);
    expect(result.summary).toMatchObject({ okRows: 0, errorRows: 4, skippedRows: 1 });
  });

  it("ignores blank lines and rejects files that are too long", () => {
    expect(analyzeImportText("nom;prix\n\n;\nSac;10\n").summary.products).toBe(1);
    const big = ["nom;prix", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i};1`)].join("\n");
    expect(analyzeImportText(big).fatalErrors).toEqual([`Trop de lignes : ${MAX_IMPORT_ROWS} au maximum par import.`]);
  });

  it("reports malformed CSV", () => {
    expect(analyzeImportText('nom;prix\n"Sac;10').fatalErrors).toEqual([
      "Fichier CSV mal formé : un guillemet n'est pas fermé.",
    ]);
  });
});

describe("analyzeImportFile", () => {
  it("reads Windows-1252 files and warns", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("nom;prix\nRobe d'"), 0xe9, 0x74, 0xe9, ...new TextEncoder().encode(";45")]);
    const result = analyzeImportFile(bytes);
    expect(result.products[0].name).toBe("Robe d'été");
    expect(result.encoding).toBe("windows-1252");
    expect(result.warnings[0]).toMatch(/Windows-1252/);
  });

  it("rejects empty and oversized files", () => {
    expect(analyzeImportFile(new Uint8Array()).fatalErrors).toEqual(["Le fichier est vide."]);
    expect(analyzeImportFile(new Uint8Array(2 * 1024 * 1024 + 1)).fatalErrors).toEqual([
      "Fichier trop volumineux (2 Mo maximum).",
    ]);
  });
});

describe("identifiersToCheck", () => {
  it("collects identifiers from all rows, including invalid ones", () => {
    expect(identifiersToCheck(csv([["nom", "prix", "sku", "code_barres"], ["Sac", "x", "S-1", "123"]]))).toEqual({
      names: ["Sac"],
      skus: ["S-1"],
      barcodes: ["123"],
    });
  });
});

describe("combinations", () => {
  it("builds the cartesian product of option values", () => {
    expect(combinations([["S", "M"], ["Noir", "Blanc"]])).toEqual([
      ["S", "Noir"],
      ["S", "Blanc"],
      ["M", "Noir"],
      ["M", "Blanc"],
    ]);
    expect(combinations([])).toEqual([[]]);
  });
});
