import { describe, expect, it } from "vitest";
import { can, invitableRoles } from "./permissions";

describe("UI permission matrix (mirrors database rules)", () => {
  it("only owners edit the organization and manage members", () => {
    expect(can("owner", "organization.update")).toBe(true);
    expect(can("manager", "organization.update")).toBe(false);
    expect(can("cashier", "organization.update")).toBe(false);
    expect(can("owner", "members.manage")).toBe(true);
    expect(can("manager", "members.manage")).toBe(false);
  });

  it("cashiers cannot see audit logs or invitations", () => {
    expect(can("cashier", "audit.view")).toBe(false);
    expect(can("cashier", "invitations.view")).toBe(false);
    expect(can("manager", "audit.view")).toBe(true);
  });

  it("cashiers can browse the catalog but not manage it or see costs", () => {
    expect(can("cashier", "catalog.manage")).toBe(false);
    expect(can("cashier", "catalog.viewCosts")).toBe(false);
    expect(can("cashier", "suppliers.manage")).toBe(false);
    expect(can("manager", "catalog.import")).toBe(true);
  });

  it("invitable roles never include owner", () => {
    expect(invitableRoles("owner")).toEqual(["manager", "cashier"]);
    expect(invitableRoles("manager")).toEqual(["cashier"]);
    expect(invitableRoles("cashier")).toEqual([]);
  });
});
