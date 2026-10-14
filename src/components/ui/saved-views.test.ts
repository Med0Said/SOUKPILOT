import { describe, expect, it } from "vitest";
import { parseViews } from "./saved-views";
import { normalize } from "./command-palette";

describe("saved views storage", () => {
  it("ignores corrupted or tampered data", () => {
    expect(parseViews("not json")).toEqual([]);
    expect(parseViews('{"name":"x"}')).toEqual([]);
    expect(parseViews('[{"name":"A","query":"q=a"},{"name":3},null,{"query":"x"}]')).toEqual([{ name: "A", query: "q=a" }]);
  });

  it("caps names, queries and the number of views", () => {
    const many = JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ name: `V${i}`.padEnd(60, "x"), query: "q=".padEnd(900, "a") })));
    const views = parseViews(many);
    expect(views).toHaveLength(10);
    expect(views[0].name).toHaveLength(40);
    expect(views[0].query).toHaveLength(500);
  });
});

describe("palette matching", () => {
  it("is accent- and case-insensitive", () => {
    expect(normalize("Crème Été")).toBe("creme ete");
    expect(normalize("Réception de marchandise").includes(normalize("RECEPTION"))).toBe(true);
  });
});
