import { describe, expect, it } from "vitest";
import { parseSidebarCollapsed, parseTheme, preferenceCookie } from "./preferences";

describe("display preferences", () => {
  it("accepts only known themes, defaulting to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("<script>")).toBe("system");
  });

  it("parses the sidebar state", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    expect(parseSidebarCollapsed("expanded")).toBe(false);
    expect(parseSidebarCollapsed(undefined)).toBe(false);
  });

  it("builds a site-wide, one-year, Lax cookie", () => {
    expect(preferenceCookie("sp_theme", "dark")).toBe("sp_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});
