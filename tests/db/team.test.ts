import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, signUp, USER_A, USER_B } from "./helpers";

// Clinics with several physios: invites, roles, what an owner alone may change.

const USER_C = "33333333-3333-3333-3333-333333333333";

let db: PGlite;
let owner: Awaited<ReturnType<typeof signUp>>;

async function invite(role = "physio") {
  const [{ token }] = await owner.as<{ token: string }>("insert into clinic_invites (clinic_id, role) values ($1, $2) returning token", [owner.clinicId, role]);
  return token;
}

/** A second physio who joined the owner's clinic through an invite link. */
async function physio() {
  return signUp(db, USER_B, { full_name: "Dr. Kiran Rao", invite: await invite() });
}

beforeEach(async () => {
  db = await freshDb();
  owner = await signUp(db, USER_A, { full_name: "Priya", clinic_name: "Priya Physio" });
});

describe("invite links", () => {
  it("a new account that signs up with one joins the clinic instead of starting its own", async () => {
    const p = await physio();
    expect(p.clinicId).toBe(owner.clinicId);
    expect(await p.as("select role, designation, display_name from clinic_members where user_id = $1", [USER_B])).toEqual([
      { role: "physio", designation: "Dr.", display_name: "Kiran Rao" },
    ]);
    expect(await owner.as<{ n: number }>("select count(*)::int as n from clinics")).toEqual([{ n: 1 }]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from clinics")).rows).toEqual([{ n: 1 }]);
  });

  it("work once, and not after they expire", async () => {
    const token = await invite();
    await signUp(db, USER_B, { invite: token });
    const c = await signUp(db, USER_C, { invite: token }); // already used: gets a practice of their own
    expect(c.clinicId).not.toBe(owner.clinicId);

    await db.query("update clinic_invites set used_at = null, used_by = null, expires_at = now() - interval '1 day'");
    expect((await db.query("select * from invite_info($1)", [token])).rows).toEqual([]);
  });

  it("show the clinic's name to someone not signed in yet", async () => {
    const token = await invite();
    await db.exec("set role anon;");
    try {
      expect((await db.query("select * from invite_info($1)", [token])).rows).toEqual([{ clinic_name: "Priya Physio", invited_by: "Priya", role: "physio" }]);
      await expect(db.query("select * from clinic_invites")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role;");
    }
  });

  it("are only for owners to make and see", async () => {
    const p = await physio();
    await expect(p.as("insert into clinic_invites (clinic_id) values ($1)", [owner.clinicId])).rejects.toThrow(/row-level security/);
    expect(await p.as("select * from clinic_invites")).toEqual([]);
  });

  it("an existing account with an empty practice can accept one; one with patients can't", async () => {
    const empty = await signUp(db, USER_B);
    await empty.as("select accept_invite($1)", [await invite()]);
    expect(await empty.as("select clinic_id, role from clinic_members where user_id = $1", [USER_B])).toEqual([{ clinic_id: owner.clinicId, role: "physio" }]);
    expect((await db.query("select * from clinics where id = $1", [empty.clinicId])).rows).toEqual([]); // the empty practice is gone

    const busy = await signUp(db, USER_C);
    await busy.as("insert into patients (clinic_id, name) values ($1, 'Meena')", [busy.clinicId]);
    await expect(busy.as("select accept_invite($1)", [await invite()])).rejects.toThrow(/already has its own practice/);
    expect(await busy.as<{ n: number }>("select count(*)::int as n from patients")).toEqual([{ n: 1 }]);
  });
});

describe("roles", () => {
  it("a physio can rename themselves but not make themselves owner", async () => {
    const p = await physio();
    await p.as("update clinic_members set display_name = 'Kiran R.' where user_id = $1", [USER_B]);
    await expect(p.as("update clinic_members set role = 'owner' where user_id = $1", [USER_B])).rejects.toThrow(/permission denied/);
    await expect(p.as("select set_member_role($1, $2, 'owner')", [owner.clinicId, USER_B])).rejects.toThrow(/Only a clinic owner/);
  });

  it("only owners change clinic-wide settings; everyone manages patients", async () => {
    const p = await physio();
    const c = owner.clinicId;
    await expect(p.as("insert into visit_types (clinic_id, name) values ($1, 'Sports massage')", [c])).rejects.toThrow(/row-level security/);
    await expect(p.as("insert into rates (clinic_id, kind, amount, effective_from) values ($1, 'no_show', 100, '2026-01-01')", [c])).rejects.toThrow(
      /row-level security/,
    );
    await expect(p.as("insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-12-24', '2026-12-26', 'clinic')", [c])).rejects.toThrow(
      /row-level security/,
    );
    expect(await p.as("update visit_types set name = 'X' returning id")).toEqual([]);

    const [{ id: patient }] = await p.as<{ id: string }>("insert into patients (clinic_id, name, physio_id) values ($1, 'Meena', $2) returning id", [c, USER_B]);
    const [{ id: inClinic }] = await p.as<{ id: string }>("select id from visit_types order by sort limit 1");
    await p.as("insert into rates (clinic_id, patient_id, kind, visit_type_id, amount, effective_from) values ($1, $2, 'visit', $3, 700, '2026-01-01')", [
      c,
      patient,
      inClinic,
    ]);
    await p.as("insert into days_off (clinic_id, patient_id, from_date, to_date, cancelled_by) values ($1, $2, '2026-12-24', '2026-12-24', 'patient')", [c, patient]);
    await owner.as("insert into visit_types (clinic_id, name) values ($1, 'Sports massage')", [c]);
  });

  it("the clinic always keeps an owner", async () => {
    await physio();
    await expect(owner.as("select set_member_role($1, $2, 'physio')", [owner.clinicId, USER_A])).rejects.toThrow(/at least one owner/);
    await owner.as("select set_member_role($1, $2, 'owner')", [owner.clinicId, USER_B]);
    await owner.as("select set_member_role($1, $2, 'physio')", [owner.clinicId, USER_A]);
    expect(await owner.as("select user_id, role from clinic_members order by user_id")).toEqual([
      { user_id: USER_A, role: "physio" },
      { user_id: USER_B, role: "owner" },
    ]);
  });
});

describe("leaving and removing", () => {
  it("a removed physio's patients become unassigned, their records stay", async () => {
    const p = await physio();
    const [{ id: patient }] = await p.as<{ id: string }>("insert into patients (clinic_id, name, physio_id) values ($1, 'Meena', $2) returning id", [
      owner.clinicId,
      USER_B,
    ]);
    await p.as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-10-01', 'attended')", [owner.clinicId, patient]);
    await expect(p.as("select remove_member($1, $2)", [owner.clinicId, USER_A])).rejects.toThrow(/Only a clinic owner/);

    await owner.as("select remove_member($1, $2)", [owner.clinicId, USER_B]);
    expect(await owner.as("select physio_id from patients")).toEqual([{ physio_id: null }]);
    expect(await owner.as("select recorded_by from sessions")).toEqual([{ recorded_by: USER_B }]);
    expect(await p.as("select * from patients")).toEqual([]); // no longer sees the clinic
    await p.as("select start_own_practice()");
    expect(await p.as("select role from clinic_members")).toEqual([{ role: "owner" }]);
  });

  it("a physio can leave; the only owner can't", async () => {
    const p = await physio();
    await expect(owner.as("select leave_clinic($1)", [owner.clinicId])).rejects.toThrow(/someone else an owner/);
    await p.as("select leave_clinic($1)", [owner.clinicId]);
    expect(await owner.as<{ n: number }>("select count(*)::int as n from clinic_members")).toEqual([{ n: 1 }]);
  });
});

describe("weak-signal safety", () => {
  it("a resent form submission is recognised", async () => {
    const key = "44444444-4444-4444-4444-444444444444";
    await owner.as("insert into request_keys (key, clinic_id) values ($1, $2)", [key, owner.clinicId]);
    await expect(owner.as("insert into request_keys (key, clinic_id) values ($1, $2)", [key, owner.clinicId])).rejects.toThrow(/duplicate key/);
  });

  it("a patient can't get two visits on one day", async () => {
    const [{ id }] = await owner.as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'Meena') returning id", [owner.clinicId]);
    const visit = "insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-10-01', 'attended')";
    await owner.as(visit, [owner.clinicId, id]);
    await expect(owner.as(visit, [owner.clinicId, id])).rejects.toThrow(/sessions_one_per_day/);
  });
});

describe("feedback", () => {
  it("is private to the person who sent it", async () => {
    const p = await physio();
    await owner.as("insert into feedback (clinic_id, kind, message) values ($1, 'idea', 'Reminders please')", [owner.clinicId]);
    expect(await p.as("select * from feedback")).toEqual([]);
    await expect(p.as("insert into feedback (clinic_id, user_id, kind, message) values ($1, $2, 'problem', 'x')", [owner.clinicId, USER_A])).rejects.toThrow(
      /row-level security/,
    );
  });
});
