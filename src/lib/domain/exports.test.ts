import { describe, expect, it } from "vitest";
import { analyzeImportText } from "./catalog-import";
import { toCsv } from "./csv";
import { catalogExportRows, customersExportRows, movementExportRows, salesExportRows, type ExportProduct } from "./exports";

const products: ExportProduct[] = [
  {
    name: "T-shirt col V",
    category: "Vêtements",
    supplier: "Atelier Nabeul",
    description: "Coton; 100 %",
    optionNames: ["Taille", "Couleur"],
    trackStock: true,
    isActive: true,
    variants: [
      { optionValues: ["S", "Noir"], sku: "TSV-S-NOI", barcode: null, priceMillimes: 25_000, costMillimes: 12_500, lowStockThreshold: 2, isActive: true },
      { optionValues: ["M", "Noir"], sku: "TSV-M-NOI", barcode: "6199990000017", priceMillimes: 25_000, costMillimes: null, lowStockThreshold: null, isActive: true },
    ],
  },
  {
    name: "Retouche",
    category: null,
    supplier: null,
    description: null,
    optionNames: [],
    trackStock: false,
    isActive: true,
    variants: [{ optionValues: [], sku: null, barcode: null, priceMillimes: 5_000, costMillimes: null, lowStockThreshold: null, isActive: true }],
  },
];

describe("catalogExportRows", () => {
  it("round-trips through the import analyzer (same columns as the template)", () => {
    const text = toCsv(catalogExportRows(products, { withCosts: true }));
    const result = analyzeImportText(text);
    expect(result.fatalErrors).toEqual([]);
    expect(result.summary).toMatchObject({ products: 2, variants: 3, errorRows: 0 });
    // Only the extra "actif" column is unknown to the importer.
    expect(result.warnings).toEqual([expect.stringContaining("actif")]);
    expect(result.products).toEqual([
      {
        name: "T-shirt col V",
        description: "Coton; 100 %",
        category_name: "Vêtements",
        supplier_name: "Atelier Nabeul",
        option_names: ["Taille", "Couleur"],
        track_stock: true,
        variants: [
          { sku: "TSV-S-NOI", barcode: null, option_values: ["S", "Noir"], price_millimes: 25_000, cost_millimes: 12_500, low_stock_threshold: 2 },
          { sku: "TSV-M-NOI", barcode: "6199990000017", option_values: ["M", "Noir"], price_millimes: 25_000, cost_millimes: null, low_stock_threshold: null },
        ],
      },
      {
        name: "Retouche",
        description: null,
        category_name: null,
        supplier_name: null,
        option_names: [],
        track_stock: false,
        variants: [{ sku: null, barcode: null, option_values: [], price_millimes: 5_000, cost_millimes: null, low_stock_threshold: null }],
      },
    ]);
  });

  it("leaves out purchase costs for cashiers", () => {
    const rows = catalogExportRows(products, { withCosts: false });
    expect(rows[0]).not.toContain("prix_achat");
    expect(toCsv(rows)).not.toContain("12,500");
  });

  it("writes amounts as numbers and neutralizes formulas in text", () => {
    const hostile: ExportProduct = { ...products[1], name: "=HYPERLINK(\"http://x\")", description: "-2+3" };
    const csv = toCsv(catalogExportRows([hostile], { withCosts: false }));
    const line = csv.split("\r\n")[1];
    expect(line.startsWith(`"'=HYPERLINK(""http://x"")"`)).toBe(true);
    expect(line).toContain(";'-2+3;");
    expect(line).toContain(";5,000;");
  });
});

describe("other exports", () => {
  it("sales: number, local date, amounts, and no balance due on drafts", () => {
    const rows = salesExportRows(
      [
        {
          number: 12,
          status: "finalized",
          customer_name: "Leïla",
          total_millimes: 186_000,
          returned_millimes: 0,
          paid_millimes: 50_000,
          due_millimes: 136_000,
          created_at: "2026-03-10T23:30:00Z",
          finalized_at: "2026-03-10T23:30:00Z",
        },
        {
          number: null,
          status: "draft",
          customer_name: null,
          total_millimes: 9_500,
          returned_millimes: 0,
          paid_millimes: 0,
          due_millimes: 9_500,
          created_at: "2026-03-11T08:00:00Z",
          finalized_at: null,
        },
      ],
      "Africa/Tunis",
    );
    expect(toCsv(rows).split("\r\n").slice(1)).toEqual([
      "000012;2026-03-11 00:30;Leïla;186,000;0,000;50,000;136,000;Finalisée",
      ";2026-03-11 09:00;;9,500;0,000;0,000;0,000;Brouillon",
    ]);
  });

  it("customers: a negative balance (credit) stays a number", () => {
    const csv = toCsv(
      customersExportRows(
        [{ name: "Karim", phone: "+216 22 333 444", is_active: true, sales_count: 3, balance_millimes: -4_000, created_at: "2026-01-02T10:00:00Z" }],
        "Africa/Tunis",
      ),
    );
    // "+216…" is text that starts like a formula: guarded. "-4,000" is a number: not guarded.
    expect(csv.split("\r\n")[1]).toBe("Karim;'+216 22 333 444;oui;3;-4,000;2026-01-02");
  });

  it("movements: signed quantities and French labels", () => {
    const csv = toCsv(
      movementExportRows(
        [
          {
            created_at: "2026-03-10T12:00:00Z",
            article: "Jean slim (40)",
            sku: "JEA-40",
            movement_type: "sale",
            location: "Boutique",
            quantity_delta: -2,
            quantity_after: 5,
            reason: null,
          },
        ],
        "Africa/Tunis",
      ),
    );
    expect(csv.split("\r\n")[1]).toMatch(/^2026-03-10 13:00;Jean slim \(40\);JEA-40;[^;]+;Boutique;-2;5;$/);
  });
});
