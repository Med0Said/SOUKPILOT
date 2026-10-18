import { afterEach, describe, expect, it, vi } from "vitest";
import { must, QueryFailedError } from "./query";

describe("must", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the data when the query succeeded, including null for 'no row'", () => {
    expect(must({ data: [1, 2], error: null }, "test.load")).toEqual([1, 2]);
    expect(must({ data: null, error: null }, "test.load")).toBeNull();
  });

  it("logs and throws when the query failed, so an outage is never shown as 'not found' or as zero", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      must({ data: null, error: { code: "57P01", message: "terminating connection" } }, "purchases.detail_load_failed", { organizationId: "org-1" }),
    ).toThrow(QueryFailedError);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "error", event: "purchases.detail_load_failed", organizationId: "org-1", code: "57P01" });
  });

  it("the thrown error carries no database detail (it may reach the client)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      must({ data: null, error: { code: "42P01", message: 'relation "secret_table" does not exist' } }, "x.y");
    } catch (error) {
      expect((error as Error).message).toBe("query_failed");
      expect((error as Error).message).not.toContain("secret_table");
    }
  });
});
