import { describe, expect, it } from "vitest";
import { isProtectedPath, safeNextPath } from "./routes";

describe("safeNextPath (open-redirect protection)", () => {
  it.each([
    ["/app", "/app"],
    ["/app/settings/members?tab=1", "/app/settings/members?tab=1"],
    ["/invitations#x", "/invitations#x"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "app",
    "",
    "/app\n/evil",
    "/\t/evil.example",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/app");
  });

  it("rejects non-strings and uses the given fallback", () => {
    expect(safeNextPath(undefined, "/onboarding")).toBe("/onboarding");
    expect(safeNextPath(42)).toBe("/app");
  });
});

describe("isProtectedPath", () => {
  it.each(["/app", "/app/settings/members", "/onboarding", "/invitations", "/reset-password"])(
    "protects %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );
  it.each(["/", "/login", "/signup", "/forgot-password", "/auth/confirm", "/apply", "/application"])(
    "leaves %s public",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});
