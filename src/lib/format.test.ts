import { describe, expect, it } from "vitest";
import { formatDateTime, formatIsoDate, formatIsoDateTime } from "./format";

describe("date formatting in the organization's time zone", () => {
  const lateEvening = "2026-03-10T23:30:00Z"; // 00:30 on the 11th in Tunis

  it("uses a 24-hour clock on screen", () => {
    expect(formatDateTime("2026-03-10T12:05:00Z", "Africa/Tunis")).toMatch(/^10\/03\/2026,? 13:05$/);
    expect(formatDateTime(lateEvening, "Africa/Tunis")).toMatch(/^11\/03\/2026,? 00:30$/);
  });

  it("exports sortable dates", () => {
    expect(formatIsoDate(lateEvening, "Africa/Tunis")).toBe("2026-03-11");
    expect(formatIsoDateTime(lateEvening, "Africa/Tunis")).toBe("2026-03-11 00:30");
    expect(formatIsoDateTime(lateEvening, "UTC")).toBe("2026-03-10 23:30");
  });
});
