import { describe, expect, it } from "vitest";
import {
  createOrganizationSchema,
  emailSchema,
  fieldErrorsFrom,
  formDataToObject,
  invitationSchema,
  newPasswordSchema,
  phoneSchema,
  resetPasswordSchema,
} from "./schemas";

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Amal.Ben@Example.TN ")).toBe("amal.ben@example.tn");
  });
  it("rejects invalid addresses", () => {
    expect(emailSchema.safeParse("pas-un-email").success).toBe(false);
  });
});

describe("newPasswordSchema (mirrors Supabase Auth settings)", () => {
  it.each(["motdepasse1", "Tunis2026!", "été2026abcd"])("accepts %s", (pw) => {
    expect(newPasswordSchema.safeParse(pw).success).toBe(true);
  });
  it.each(["court1", "seulementdeslettres", "1234567890", "a1".repeat(40)])("rejects %s", (pw) => {
    expect(newPasswordSchema.safeParse(pw).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching confirmation", () => {
    const result = resetPasswordSchema.safeParse({ password: "motdepasse1", confirmPassword: "autre12345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error)).toHaveProperty("confirmPassword");
    }
  });
});

describe("phoneSchema", () => {
  it.each([
    ["+216 20 123 456", "+216 20 123 456"],
    ["20123456", "20123456"],
    ["(+33) 6 12-34-56-78", null],
    ["", null],
  ])("handles %j", (input, expected) => {
    const result = phoneSchema.safeParse(input);
    if (expected === null && input !== "") {
      expect(result.success).toBe(false);
    } else {
      expect(result.success && result.data).toBe(expected);
    }
  });
  it("accepts international formats with the + prefix", () => {
    expect(phoneSchema.parse("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
  });
  it("rejects letters", () => {
    expect(phoneSchema.safeParse("appelez-moi").success).toBe(false);
  });
});

describe("createOrganizationSchema", () => {
  it("accepts a typical Tunisian shop", () => {
    const parsed = createOrganizationSchema.parse({
      name: "  Boutique El Medina ",
      locationName: "Sousse centre",
      timezone: "Africa/Tunis",
    });
    expect(parsed.name).toBe("Boutique El Medina");
  });
  it("rejects unknown time zones", () => {
    expect(
      createOrganizationSchema.safeParse({ name: "Boutique", locationName: "A", timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });
});

describe("invitationSchema", () => {
  it("never allows inviting an owner", () => {
    expect(
      invitationSchema.safeParse({
        organizationId: "6f1c1e0e-8a0b-4d8e-9a43-5d0f6f4b2a11",
        email: "a@b.tn",
        role: "owner",
      }).success,
    ).toBe(false);
  });
  it("rejects malformed organization ids", () => {
    expect(invitationSchema.safeParse({ organizationId: "1 OR 1=1", email: "a@b.tn", role: "cashier" }).success).toBe(
      false,
    );
  });
});

describe("formDataToObject", () => {
  it("keeps string fields and drops Next.js internal fields", () => {
    const fd = new FormData();
    fd.set("name", "Boutique");
    fd.set("$ACTION_ID_abc", "");
    expect(formDataToObject(fd)).toEqual({ name: "Boutique" });
  });
});
