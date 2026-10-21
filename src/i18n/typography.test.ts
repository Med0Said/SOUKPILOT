import { describe, expect, it } from "vitest";
import { AUTH_ERROR_MESSAGES, DB_ERROR_MESSAGES, GENERIC_ERROR } from "@/lib/errors";
import { fr } from "./fr";
import { frErrors } from "./fr-errors";

/**
 * French typography: "?", "!" and ";" take a narrow no-break space (U+202F)
 * before them, ":" a no-break space (U+00A0), so the sign never wraps alone
 * onto the next line; guillemets hold their text with U+202F. Functions are
 * rendered with sample arguments.
 */
function texts(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (typeof value === "function") {
    // "2" works as a count (coerced in comparisons) and as a name.
    const args = Array.from({ length: value.length }, () => "2");
    texts((value as (...a: unknown[]) => unknown)(...args), path, out);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) texts(child, `${path}.${key}`, out);
  }
  return out;
}

const all = [...texts(fr, "fr"), ...texts(frErrors, "frErrors"), ...texts({ DB_ERROR_MESSAGES, AUTH_ERROR_MESSAGES, GENERIC_ERROR }, "errors")];

describe("French typography in UI strings", () => {
  it("finds the strings to check", () => {
    expect(all.length).toBeGreaterThan(700);
  });

  it("never puts a breakable space before ? ! ; : » or after «", () => {
    expect(all.filter((s) => /[ \t\n][?!;:»]|«[ \t\n]/.test(s.text)).map((s) => `${s.path}: ${s.text}`)).toEqual([]);
  });

  it("uses U+202F before ? ! ; and U+00A0 before :", () => {
    expect(all.filter((s) => /\u00A0[?!;]|\u202F:/.test(s.text)).map((s) => s.path)).toEqual([]);
  });
});
