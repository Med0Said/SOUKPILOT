/**
 * Tenant isolation and role-based access, exercised against the real
 * migrations with the `authenticated` / `anon` roles (as PostgREST would).
 *
 * Fixture: two organizations.
 *   Org A ("Boutique Amal"): ownerA, managerA, cashierA
 *   Org B ("Cosmétiques Béja"): ownerB
 *   outsider: signed-in user with no membership
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  addMember,
  asAnon,
  asUser,
  createOrganization,
  createTestDb,
  createUser,
  queryAs,
  type TestUser,
} from "./harness";

let db: PGlite;
let ownerA: TestUser;
let managerA: TestUser;
let cashierA: TestUser;
let ownerB: TestUser;
let outsider: TestUser;
let orgA: string;
let orgB: string;
let locationA: string;
let locationB: string;

beforeAll(async () => {
  db = await createTestDb();
  ownerA = await createUser(db, "owner.a@example.tn", { fullName: "Amal Owner" });
  managerA = await createUser(db, "manager.a@example.tn", { fullName: "Mehdi Manager" });
  cashierA = await createUser(db, "cashier.a@example.tn", { fullName: "Chaima Cashier" });
  ownerB = await createUser(db, "owner.b@example.tn", { fullName: "Bilel Owner" });
  outsider = await createUser(db, "outsider@example.tn");

  orgA = await createOrganization(db, ownerA, "Boutique Amal");
  orgB = await createOrganization(db, ownerB, "Cosmétiques Béja");
  await addMember(db, orgA, managerA, "manager");
  await addMember(db, orgA, cashierA, "cashier");

  locationA = (
    await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [orgA])
  ).rows[0].id;
  locationB = (
    await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [orgB])
  ).rows[0].id;
});

afterAll(async () => {
  await db.close();
});

describe("create_organization", () => {
  it("creates the org, an owner membership, a default location and an audit entry atomically", async () => {
    const members = await db.query<{ role: string }>(
      "select role from public.organization_members where organization_id = $1 and user_id = $2",
      [orgA, ownerA.id],
    );
    expect(members.rows).toEqual([{ role: "owner" }]);

    const locations = await db.query<{ name: string; code: string }>(
      "select name, code from public.locations where organization_id = $1",
      [orgA],
    );
    expect(locations.rows).toEqual([{ name: "Boutique principale", code: "MAIN" }]);

    const audit = await db.query<{ action: string; actor_id: string }>(
      "select action, actor_id from public.audit_logs where organization_id = $1 and action = 'organization.created'",
      [orgA],
    );
    expect(audit.rows).toEqual([{ action: "organization.created", actor_id: ownerA.id }]);
  });

  it("rejects invalid names and timezones without leaving partial rows", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from public.organizations");
    await expect(queryAs(db, outsider, "select public.create_organization(' ')")).rejects.toThrow(
      "invalid_name",
    );
    await expect(
      queryAs(db, outsider, "select public.create_organization('Valide', 'Mars/Olympus')"),
    ).rejects.toThrow("invalid_timezone");
    const after = await db.query<{ n: number }>("select count(*)::int as n from public.organizations");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("limits the number of organizations one account can create", async () => {
    const spammer = await createUser(db, "spam@example.tn");
    for (let i = 0; i < 5; i++) {
      await createOrganization(db, spammer, `Boutique ${i}`);
    }
    await expect(createOrganization(db, spammer, "Boutique 6")).rejects.toThrow(
      "organization_limit_reached",
    );
  });

  it("is not callable anonymously", async () => {
    await expect(
      asAnon(db, (tx) => tx.query("select public.create_organization('Pirate')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("cross-tenant reads", () => {
  it("each owner sees only their own organization", async () => {
    const a = await queryAs<{ id: string }>(db, ownerA, "select id from public.organizations");
    expect(a.map((r) => r.id)).toEqual([orgA]);
    const b = await queryAs<{ id: string }>(db, ownerB, "select id from public.organizations");
    expect(b.map((r) => r.id)).toEqual([orgB]);
  });

  it("a user without membership sees nothing", async () => {
    for (const table of [
      "organizations",
      "organization_members",
      "locations",
      "organization_invitations",
      "audit_logs",
    ]) {
      const rows = await queryAs(db, outsider, `select * from public.${table}`);
      expect(rows, table).toEqual([]);
    }
  });

  it("filtering by another tenant's id returns no rows (client-supplied ids are not trusted)", async () => {
    expect(await queryAs(db, ownerA, "select * from public.organizations where id = $1", [orgB])).toEqual(
      [],
    );
    expect(
      await queryAs(db, ownerA, "select * from public.organization_members where organization_id = $1", [
        orgB,
      ]),
    ).toEqual([]);
    expect(await queryAs(db, ownerA, "select * from public.locations where id = $1", [locationB])).toEqual(
      [],
    );
    expect(
      await queryAs(db, ownerA, "select * from public.audit_logs where organization_id = $1", [orgB]),
    ).toEqual([]);
  });

  it("profiles are visible only to self and co-members", async () => {
    const seenByA = await queryAs<{ id: string }>(db, ownerA, "select id from public.profiles order by id");
    expect(new Set(seenByA.map((r) => r.id))).toEqual(new Set([ownerA.id, managerA.id, cashierA.id]));
    const seenByB = await queryAs<{ id: string }>(db, ownerB, "select id from public.profiles");
    expect(seenByB.map((r) => r.id)).toEqual([ownerB.id]);
  });

  it("list_organization_members refuses non-members", async () => {
    await expect(
      queryAs(db, ownerB, "select * from public.list_organization_members($1)", [orgA]),
    ).rejects.toThrow("forbidden");
  });

  it("anonymous requests read nothing at all", async () => {
    await expect(asAnon(db, (tx) => tx.query("select * from public.organizations"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(db, (tx) => tx.query("select * from public.profiles"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("cross-tenant writes", () => {
  it("an owner cannot update another tenant's organization", async () => {
    const updated = await queryAs(
      db,
      ownerA,
      "update public.organizations set name = 'Piraté' where id = $1 returning id",
      [orgB],
    );
    expect(updated).toEqual([]);
    const name = await db.query<{ name: string }>("select name from public.organizations where id = $1", [
      orgB,
    ]);
    expect(name.rows[0].name).toBe("Cosmétiques Béja");
  });

  it("an owner cannot create a location inside another tenant", async () => {
    await expect(
      queryAs(db, ownerA, "insert into public.locations (organization_id, name) values ($1, 'Intrus')", [
        orgB,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("an owner cannot move a location to another tenant", async () => {
    await expect(
      queryAs(db, ownerA, "update public.locations set organization_id = $1 where id = $2", [
        orgB,
        locationA,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("a user cannot add themselves to an organization by direct insert", async () => {
    await expect(
      queryAs(
        db,
        outsider,
        "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')",
        [orgA, outsider.id],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("an owner cannot manage members of another tenant via functions", async () => {
    await expect(
      queryAs(db, ownerA, "select public.update_member_role($1, $2, 'cashier')", [orgB, ownerB.id]),
    ).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, ownerA, "select public.remove_member($1, $2)", [orgB, ownerB.id]),
    ).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, ownerA, "select public.create_invitation($1, 'x@example.tn', 'manager')", [orgB]),
    ).rejects.toThrow("forbidden");
  });

  it("audit logs cannot be written, edited or deleted by API users", async () => {
    await expect(
      queryAs(
        db,
        ownerA,
        "insert into public.audit_logs (organization_id, action, entity_type) values ($1, 'fake.entry', 'x')",
        [orgA],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, ownerA, "update public.audit_logs set action = 'x.y' where organization_id = $1", [orgA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, ownerA, "delete from public.audit_logs where organization_id = $1", [orgA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, ownerA, "select private.write_audit($1, 'fake.entry', 'x', null, '{}')", [orgA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("audit logs are immutable even for the database owner", async () => {
    await expect(db.query("update public.audit_logs set action = 'x.y'")).rejects.toThrow(
      "audit_log_immutable",
    );
  });
});

describe("roles inside one organization", () => {
  it("only owners can update organization settings, and changes are audited", async () => {
    const byManager = await queryAs(
      db,
      managerA,
      "update public.organizations set name = 'Par manager' where id = $1 returning id",
      [orgA],
    );
    expect(byManager).toEqual([]);
    const byCashier = await queryAs(
      db,
      cashierA,
      "update public.organizations set name = 'Par caissier' where id = $1 returning id",
      [orgA],
    );
    expect(byCashier).toEqual([]);

    const byOwner = await queryAs(
      db,
      ownerA,
      "update public.organizations set name = 'Boutique Amal Centre' where id = $1 returning id",
      [orgA],
    );
    expect(byOwner).toHaveLength(1);
    const audit = await db.query<{ details: { name: string[] } }>(
      "select details from public.audit_logs where organization_id = $1 and action = 'organization.updated'",
      [orgA],
    );
    expect(audit.rows[0].details.name).toEqual(["Boutique Amal", "Boutique Amal Centre"]);
  });

  it("owners cannot change protected organization columns", async () => {
    await expect(
      queryAs(db, ownerA, "update public.organizations set created_by = $1 where id = $2", [
        outsider.id,
        orgA,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, ownerA, "update public.organizations set currency_code = 'EUR' where id = $1", [orgA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("managers can create locations; cashiers cannot", async () => {
    const created = await queryAs<{ id: string }>(
      db,
      managerA,
      "insert into public.locations (organization_id, name, code) values ($1, 'Dépôt', 'DEPOT') returning id",
      [orgA],
    );
    expect(created).toHaveLength(1);
    await expect(
      queryAs(db, cashierA, "insert into public.locations (organization_id, name) values ($1, 'Caisse 2')", [
        orgA,
      ]),
    ).rejects.toThrow(/row-level security/);
    const deleted = await queryAs(db, ownerA, "delete from public.locations where id = $1", [locationA]).catch(
      (e: Error) => e,
    );
    expect(deleted).toBeInstanceOf(Error);
  });

  it("cashiers cannot read audit logs or invitations", async () => {
    expect(await queryAs(db, cashierA, "select * from public.audit_logs")).toEqual([]);
    expect(await queryAs(db, cashierA, "select * from public.organization_invitations")).toEqual([]);
    expect((await queryAs(db, managerA, "select * from public.audit_logs")).length).toBeGreaterThan(0);
  });

  it("emails of members are visible to owner/manager, hidden from cashiers (except their own)", async () => {
    const forManager = await queryAs<{ email: string | null }>(
      db,
      managerA,
      "select email from public.list_organization_members($1)",
      [orgA],
    );
    expect(forManager.every((r) => r.email !== null)).toBe(true);
    const forCashier = await queryAs<{ user_id: string; email: string | null }>(
      db,
      cashierA,
      "select user_id, email from public.list_organization_members($1)",
      [orgA],
    );
    for (const row of forCashier) {
      expect(row.email).toBe(row.user_id === cashierA.id ? cashierA.email : null);
    }
  });

  it("nobody can promote themselves", async () => {
    await expect(
      queryAs(db, cashierA, "select public.update_member_role($1, $2, 'owner')", [orgA, cashierA.id]),
    ).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, managerA, "select public.update_member_role($1, $2, 'owner')", [orgA, managerA.id]),
    ).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, ownerA, "select public.update_member_role($1, $2, 'cashier')", [orgA, ownerA.id]),
    ).rejects.toThrow("cannot_change_own_role");
    await expect(
      queryAs(db, cashierA, "update public.organization_members set role = 'owner' where user_id = $1", [
        cashierA.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("managers cannot change roles; owners can, with an audit entry", async () => {
    await expect(
      queryAs(db, managerA, "select public.update_member_role($1, $2, 'manager')", [orgA, cashierA.id]),
    ).rejects.toThrow("forbidden");

    await queryAs(db, ownerA, "select public.update_member_role($1, $2, 'manager')", [orgA, cashierA.id]);
    await queryAs(db, ownerA, "select public.update_member_role($1, $2, 'cashier')", [orgA, cashierA.id]);
    const audit = await db.query<{ details: { from: string; to: string } }>(
      `select details from public.audit_logs
       where organization_id = $1 and action = 'member.role_changed' and entity_id = $2
       order by created_at`,
      [orgA, cashierA.id],
    );
    expect(audit.rows.map((r) => r.details)).toEqual([
      { from: "cashier", to: "manager" },
      { from: "manager", to: "cashier" },
    ]);
  });

  it("the last owner can be neither demoted nor removed", async () => {
    const solo = await createUser(db, "solo@example.tn");
    const soloOrg = await createOrganization(db, solo, "Solo Shop");
    await expect(queryAs(db, solo, "select public.remove_member($1, $2)", [soloOrg, solo.id])).rejects.toThrow(
      "last_owner",
    );
    // Even the platform cannot leave an organization ownerless by accident.
    await expect(
      db.query("update public.organization_members set role = 'manager' where organization_id = $1", [soloOrg]),
    ).rejects.toThrow("last_owner");
  });

  it("ownership can be transferred: promote another owner, then the old owner steps down", async () => {
    const o1 = await createUser(db, "o1@example.tn");
    const o2 = await createUser(db, "o2@example.tn");
    const org = await createOrganization(db, o1, "Transfert");
    await addMember(db, org, o2, "manager");
    await queryAs(db, o1, "select public.update_member_role($1, $2, 'owner')", [org, o2.id]);
    await queryAs(db, o2, "select public.update_member_role($1, $2, 'manager')", [org, o1.id]);
    const roles = await db.query<{ user_id: string; role: string }>(
      "select user_id, role from public.organization_members where organization_id = $1",
      [org],
    );
    expect(Object.fromEntries(roles.rows.map((r) => [r.user_id, r.role]))).toEqual({
      [o1.id]: "manager",
      [o2.id]: "owner",
    });
  });

  it("cashiers can leave but cannot remove others", async () => {
    const extra = await createUser(db, "extra@example.tn");
    await addMember(db, orgA, extra, "cashier");
    await expect(
      queryAs(db, cashierA, "select public.remove_member($1, $2)", [orgA, extra.id]),
    ).rejects.toThrow("forbidden");
    await queryAs(db, extra, "select public.remove_member($1, $2)", [orgA, extra.id]);
    const left = await db.query("select 1 from public.organization_members where user_id = $1", [extra.id]);
    expect(left.rows).toEqual([]);
  });

  it("users may edit only their own profile, and only whitelisted columns", async () => {
    const own = await queryAs(
      db,
      cashierA,
      "update public.profiles set full_name = 'Chaïma B.', phone = '+216 20 123 456' where id = $1 returning id",
      [cashierA.id],
    );
    expect(own).toHaveLength(1);
    const other = await queryAs(
      db,
      cashierA,
      "update public.profiles set full_name = 'Hacked' where id = $1 returning id",
      [ownerA.id],
    );
    expect(other).toEqual([]);
    await expect(
      queryAs(db, cashierA, "update public.profiles set id = $1 where id = $2", [outsider.id, cashierA.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("invitations", () => {
  it("full flow: owner invites, invitee with the same confirmed email accepts", async () => {
    const invitee = await createUser(db, "nouvelle.vendeuse@example.tn");
    const [{ id: invitationId }] = await queryAs<{ id: string }>(
      db,
      ownerA,
      "select public.create_invitation($1, ' Nouvelle.Vendeuse@Example.tn ', 'cashier') as id",
      [orgA],
    );

    const mine = await queryAs<{ id: string; organization_name: string }>(
      db,
      invitee,
      "select id, organization_name from public.list_my_invitations()",
    );
    expect(mine.map((r) => r.id)).toEqual([invitationId]);

    // Another tenant's owner cannot see it; the outsider cannot accept it.
    expect(
      await queryAs(db, ownerB, "select * from public.organization_invitations where id = $1", [invitationId]),
    ).toEqual([]);
    await expect(
      queryAs(db, outsider, "select public.respond_to_invitation($1, true)", [invitationId]),
    ).rejects.toThrow("invitation_not_found");

    await queryAs(db, invitee, "select public.respond_to_invitation($1, true)", [invitationId]);
    const membership = await db.query<{ role: string }>(
      "select role from public.organization_members where organization_id = $1 and user_id = $2",
      [orgA, invitee.id],
    );
    expect(membership.rows).toEqual([{ role: "cashier" }]);

    // Replaying the acceptance is rejected (idempotency of the state machine).
    await expect(
      queryAs(db, invitee, "select public.respond_to_invitation($1, true)", [invitationId]),
    ).rejects.toThrow("invitation_not_pending");
  });

  it("requires a confirmed email", async () => {
    const unconfirmed = await createUser(db, "pas.confirme@example.tn", { confirmed: false });
    const [{ id }] = await queryAs<{ id: string }>(
      db,
      ownerA,
      "select public.create_invitation($1, 'pas.confirme@example.tn', 'cashier') as id",
      [orgA],
    );
    await expect(
      queryAs(db, unconfirmed, "select public.respond_to_invitation($1, true)", [id]),
    ).rejects.toThrow("email_not_confirmed");
  });

  it("rejects expired invitations", async () => {
    const late = await createUser(db, "en.retard@example.tn");
    const [{ id }] = await queryAs<{ id: string }>(
      db,
      ownerA,
      "select public.create_invitation($1, 'en.retard@example.tn', 'cashier') as id",
      [orgA],
    );
    await db.query("update public.organization_invitations set expires_at = now() - interval '1 minute' where id = $1", [
      id,
    ]);
    await expect(queryAs(db, late, "select public.respond_to_invitation($1, true)", [id])).rejects.toThrow(
      "invitation_expired",
    );
  });

  it("cannot invite owners; managers can invite cashiers only; cashiers cannot invite", async () => {
    await expect(
      queryAs(db, ownerA, "select public.create_invitation($1, 'boss@example.tn', 'owner')", [orgA]),
    ).rejects.toThrow("invalid_role");
    await expect(
      queryAs(db, managerA, "select public.create_invitation($1, 'm2@example.tn', 'manager')", [orgA]),
    ).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, cashierA, "select public.create_invitation($1, 'c2@example.tn', 'cashier')", [orgA]),
    ).rejects.toThrow("forbidden");
    const ok = await queryAs(db, managerA, "select public.create_invitation($1, 'c3@example.tn', 'cashier')", [
      orgA,
    ]);
    expect(ok).toHaveLength(1);
  });

  it("rejects duplicate pending invitations and invitations to existing members", async () => {
    await queryAs(db, ownerA, "select public.create_invitation($1, 'dup@example.tn', 'cashier')", [orgA]);
    await expect(
      queryAs(db, ownerA, "select public.create_invitation($1, 'dup@example.tn', 'manager')", [orgA]),
    ).rejects.toThrow("invitation_exists");
    await expect(
      queryAs(db, ownerA, "select public.create_invitation($1, $2, 'cashier')", [orgA, managerA.email]),
    ).rejects.toThrow("already_member");
  });

  it("invitations cannot be inserted or edited directly", async () => {
    await expect(
      queryAs(
        db,
        outsider,
        "insert into public.organization_invitations (organization_id, email, role) values ($1, $2, 'manager')",
        [orgA, outsider.email],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, ownerA, "update public.organization_invitations set role = 'owner'"),
    ).rejects.toThrow(/permission denied/);
  });

  it("revoked invitations can no longer be accepted", async () => {
    const target = await createUser(db, "revoque@example.tn");
    const [{ id }] = await queryAs<{ id: string }>(
      db,
      ownerA,
      "select public.create_invitation($1, 'revoque@example.tn', 'manager') as id",
      [orgA],
    );
    await expect(queryAs(db, managerA, "select public.revoke_invitation($1)", [id])).rejects.toThrow(
      "forbidden",
    );
    await expect(queryAs(db, ownerB, "select public.revoke_invitation($1)", [id])).rejects.toThrow(
      "invitation_not_found",
    );
    await queryAs(db, ownerA, "select public.revoke_invitation($1)", [id]);
    await expect(queryAs(db, target, "select public.respond_to_invitation($1, true)", [id])).rejects.toThrow(
      "invitation_not_pending",
    );
  });
});

describe("service role", () => {
  it("bypasses RLS (server-only key; must never reach the browser)", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (await tx.query("select id from public.organizations")).rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

it("asUser really runs as the authenticated role (guards the harness itself)", async () => {
  const rows = await asUser(db, ownerA, async (tx) =>
    (await tx.query<{ r: string; uid: string }>("select current_user as r, auth.uid()::text as uid")).rows,
  );
  expect(rows[0]).toEqual({ r: "authenticated", uid: ownerA.id });
});
