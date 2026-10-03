import { describe, expect, it } from "vitest";
import { applyMigration, freshDb, migrationFiles, signUp, USER_A } from "./helpers";

// Migration 0004 moved billing to a ledger. Existing clinics' balances must not change.

describe("upgrading to the billing ledger (0004)", () => {
  // Builds a database, then runs the later migrations on it: ~5 s normally,
  // much longer on a busy machine or a CI runner — so allow plenty of time.
  it("keeps every patient's balance the same", { timeout: 120_000 }, async () => {
    const db = await freshDb("0004_billing.sql");
    const { as, clinicId } = await signUp(db, USER_A);

    // Package 5 (1 used before the app) + 400 per extra visit; 6 dated visits, a cancellation and an absence; paid 1500.
    const [{ id: overflow }] = await as<{ id: string }>("insert into patients (clinic_id, name, rate_per_session) values ($1, 'Overflow', 400) returning id", [clinicId]);
    await as("insert into packages (clinic_id, patient_id, total_sessions, price, sessions_used_before, start_date) values ($1, $2, 5, 2000, 1, '2026-09-01')", [clinicId, overflow]);
    for (let i = 1; i <= 6; i++) {
      await as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, $3, 'attended')", [clinicId, overflow, `2026-09-0${i}`]);
    }
    await as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-09-10', 'cancelled'), ($1, $2, '2026-09-11', 'missed')", [clinicId, overflow]);
    await as("insert into payments (clinic_id, patient_id, amount) values ($1, $2, 1500)", [clinicId, overflow]);
    // Pay per visit at 600, 3 visits.
    const [{ id: perVisit }] = await as<{ id: string }>("insert into patients (clinic_id, name, rate_per_session) values ($1, 'PerVisit', 600) returning id", [clinicId]);
    for (let i = 1; i <= 3; i++) {
      await as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, $3, 'attended')", [clinicId, perVisit, `2026-09-0${i}`]);
    }

    const before = await as<{ name: string; amount_due: string }>("select name, amount_due from patient_summary order by name");

    for (const f of migrationFiles().filter((f) => f >= "0004")) await applyMigration(db, f);

    const after = await as<{ name: string; amount_due: string }>("select name, amount_due from patient_summary order by name");
    expect(after.map((r) => [r.name, Number(r.amount_due)])).toEqual(before.map((r) => [r.name, Number(r.amount_due)]));

    // The old per-visit fee became each patient's own in-clinic fee, and old "cancelled" became "cancelled by clinic".
    expect((await as("select amount from rates where patient_id is not null")).length).toBe(2);
    expect(await as<{ n: number }>("select count(*)::int as n from sessions where status = 'cancelled_clinic'")).toEqual([{ n: 1 }]);
    // Visits beyond the package carry the old fee as their charge.
    const charged = await as<{ charge: string }>("select charge from sessions where patient_id = $1 and charge > 0", [overflow]);
    expect(charged.map((c) => Number(c.charge))).toEqual([400, 400]);
  });
});
