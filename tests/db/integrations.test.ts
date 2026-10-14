/**
 * Phase 4 integrations: off by default, switched by the owner only (audited),
 * the per-call gate refuses disabled integrations, non-members, and calls
 * over the quotas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createOrganization, createTestDb, createUser, queryAs, type TestDb, type TestUser } from "./harness";

let db: TestDb;
let owner: TestUser;
let manager: TestUser;
let cashier: TestUser;
let stranger: TestUser;
let org: string;

const setEnabled = (user: TestUser, integration: string, enabled: boolean, organizationId = org) =>
  queryAs(db, user, "select public.set_integration_enabled($1, $2, $3)", [organizationId, integration, enabled]);
const consume = (user: TestUser, integration: string, organizationId = org) =>
  queryAs(db, user, "select public.consume_integration_call($1, $2)", [organizationId, integration]);

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@integrations.tn");
  manager = await createUser(db, "manager@integrations.tn");
  cashier = await createUser(db, "cashier@integrations.tn");
  stranger = await createUser(db, "stranger@integrations.tn");
  org = await createOrganization(db, owner, "Boutique Intégrations");
  await createOrganization(db, stranger, "Ailleurs");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");
});

afterAll(async () => {
  await db.close();
});

describe("integration switches", () => {
  it("are off by default: every call is refused", async () => {
    await expect(consume(cashier, "barcode_lookup")).rejects.toThrow(/integration_disabled/);
    await expect(consume(owner, "exchange_rates")).rejects.toThrow(/integration_disabled/);
  });

  it("only the owner can switch them, and it is audited", async () => {
    await expect(setEnabled(manager, "barcode_lookup", true)).rejects.toThrow(/forbidden/);
    await expect(setEnabled(cashier, "barcode_lookup", true)).rejects.toThrow(/forbidden/);
    await expect(setEnabled(stranger, "barcode_lookup", true)).rejects.toThrow(/forbidden/);
    await expect(setEnabled(owner, "send_everything", true)).rejects.toThrow(/invalid_integration/);
    await setEnabled(owner, "barcode_lookup", true);
    await setEnabled(owner, "exchange_rates", true);

    const rows = await queryAs<{ integration: string; enabled: boolean }>(
      db,
      cashier,
      "select integration, enabled from public.organization_integrations order by integration",
    );
    expect(rows).toEqual([
      { integration: "barcode_lookup", enabled: true },
      { integration: "exchange_rates", enabled: true },
    ]);
    const audit = await db.query<{ action: string; actor_id: string }>(
      "select action, actor_id from public.audit_logs where organization_id = $1 and entity_type = 'integration' order by created_at",
      [org],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(["integration.created", "integration.created"]);
    expect(audit.rows[0].actor_id).toBe(owner.id);
  });

  it("cannot be changed or read through the tables directly", async () => {
    await expect(
      queryAs(db, owner, "update public.organization_integrations set enabled = false where organization_id = $1", [org]),
    ).rejects.toThrow(/permission denied/);
    expect(await queryAs(db, stranger, "select * from public.organization_integrations where organization_id = $1", [org])).toEqual([]);
  });

  it("calls are allowed for members once on, never for outsiders", async () => {
    await consume(cashier, "exchange_rates");
    await expect(consume(stranger, "exchange_rates")).rejects.toThrow(/forbidden/);
  });

  it("barcode lookups are capped at 10 per minute per organization", async () => {
    for (let i = 0; i < 10; i++) await consume(cashier, "barcode_lookup");
    await expect(consume(cashier, "barcode_lookup")).rejects.toThrow(/rate_limited/);
  });

  it("switching off takes effect immediately", async () => {
    await setEnabled(owner, "exchange_rates", false);
    await expect(consume(cashier, "exchange_rates")).rejects.toThrow(/integration_disabled/);
    const audit = await db.query<{ details: Record<string, unknown> }>(
      "select details from public.audit_logs where organization_id = $1 and action = 'integration.updated'",
      [org],
    );
    expect(audit.rows[0].details).toMatchObject({ enabled: [true, false] });
  });
});
