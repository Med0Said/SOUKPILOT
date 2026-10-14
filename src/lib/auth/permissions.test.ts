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

  it("cashiers count and propose adjustments, but never approve or receive stock", () => {
    expect(can("cashier", "stock.count.record")).toBe(true);
    expect(can("cashier", "stock.adjust.propose")).toBe(true);
    expect(can("cashier", "stock.adjust.review")).toBe(false);
    expect(can("cashier", "stock.receive")).toBe(false);
    expect(can("cashier", "stock.valuation")).toBe(false);
    expect(can("manager", "stock.adjust.review")).toBe(true);
  });

  it("cashiers sell and collect payments but cannot process returns or see margins", () => {
    expect(can("cashier", "sales.sell")).toBe(true);
    expect(can("cashier", "sales.return")).toBe(false);
    expect(can("cashier", "sales.viewMargin")).toBe(false);
    expect(can("cashier", "paymentMethods.manage")).toBe(false);
    expect(can("manager", "sales.return")).toBe(true);
  });

  it("invitable roles never include owner", () => {
    expect(invitableRoles("owner")).toEqual(["manager", "cashier"]);
    expect(invitableRoles("manager")).toEqual(["cashier"]);
    expect(invitableRoles("cashier")).toEqual([]);
  });
});
