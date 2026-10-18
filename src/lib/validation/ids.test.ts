import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts canonical UUIDs only", () => {
    expect(isUuid("6f1c0d1e-3b2a-4c5d-8e9f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("6F1C0D1E-3B2A-4C5D-8E9F-0A1B2C3D4E5F")).toBe(true);
    for (const bad of ["-".repeat(36), "6f1c0d1e3b2a4c5d8e9f0a1b2c3d4e5f0000", "6f1c0d1e-3b2a-4c5d-8e9f-0a1b2c3d4e5", "", null, undefined, 42]) {
      expect(isUuid(bad), String(bad)).toBe(false);
    }
  });
});
