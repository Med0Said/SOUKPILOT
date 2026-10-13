import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, messageForAuthError, messageForDbError, messageWithDetail } from "./errors";
import { redactForLog } from "./logger";

describe("error mapping", () => {
  it("maps known database keys to French", () => {
    expect(messageForDbError({ message: "last_owner" })).toMatch(/propriétaire/);
    expect(messageForDbError({ message: "forbidden" })).toMatch(/autorisation/);
  });

  it("never echoes unknown database messages (may contain internals)", () => {
    expect(messageForDbError({ message: 'relation "secret_table" does not exist' })).toBe(GENERIC_ERROR);
    expect(messageForDbError(null)).toBe(GENERIC_ERROR);
  });

  it("maps unique-constraint violations from direct writes by constraint name", () => {
    expect(
      messageForDbError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "product_variants_org_sku_idx"',
      }),
    ).toMatch(/SKU/);
    expect(messageForDbError({ code: "23514", message: 'violates check constraint "x"' })).toMatch(/invalides/);
  });

  it("appends the product detail for stock errors only", () => {
    expect(messageWithDetail({ message: "insufficient_stock", details: "Chemise (S) — disponible : 2" })).toBe(
      "Stock insuffisant. Chemise (S) — disponible : 2",
    );
    expect(messageWithDetail({ message: "forbidden", details: "secret" })).not.toContain("secret");
  });

  it("maps auth error codes", () => {
    expect(messageForAuthError({ code: "invalid_credentials" })).toMatch(/incorrect/);
    expect(messageForAuthError({ code: "something_new" })).toBe(GENERIC_ERROR);
  });
});

describe("log redaction", () => {
  it("redacts sensitive keys at any depth", () => {
    expect(
      redactForLog({
        userId: "u1",
        password: "x",
        nested: { access_token: "t", Authorization: "Bearer y", email: "a@b.tn", ok: 1 },
      }),
    ).toEqual({
      userId: "u1",
      password: "[redacted]",
      nested: { access_token: "[redacted]", Authorization: "[redacted]", email: "[redacted]", ok: 1 },
    });
  });
});
