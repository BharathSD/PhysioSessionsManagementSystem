import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, migrationFiles, signUp, USER_A } from "./helpers";

let db: PGlite;
let as: Awaited<ReturnType<typeof signUp>>["as"];
let clinicId: string;

beforeAll(async () => {
  db = await freshDb();
  ({ as, clinicId } = await signUp(db, USER_A, { full_name: "Dr. Priya", clinic_name: "Priya Physio" }));
});

describe("migrations", () => {
  it("apply in order", () => {
    expect(migrationFiles()[0]).toBe("0001_init.sql");
    expect(migrationFiles().length).toBeGreaterThanOrEqual(6);
  });

  it("give a new physio their own clinic with the standard visit types", async () => {
    expect(await as("select name from clinics")).toEqual([{ name: "Priya Physio" }]);
    expect(await as("select role, display_name from clinic_members")).toEqual([{ role: "owner", display_name: "Dr. Priya" }]);
    const types = await as<{ name: string }>("select name from visit_types order by sort");
    expect(types.map((t) => t.name)).toEqual(["In-clinic session", "Home visit", "Online session", "Assessment"]);
  });
});

describe("patient balance (patient_summary view)", () => {
  it("adds packages, visit charges and extra charges, minus payments", async () => {
    const [{ id: p }] = await as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'Rahul') returning id", [clinicId]);
    const [{ id: pkg }] = await as<{ id: string }>(
      "insert into packages (clinic_id, patient_id, total_sessions, price, sessions_used_before) values ($1, $2, 10, 5000, 2) returning id",
      [clinicId, p],
    );
    // 3 visits from the package, 1 home visit charged, 1 absence (free)
    for (const date of ["2026-09-01", "2026-09-03", "2026-09-05"]) {
      await as("insert into sessions (clinic_id, patient_id, session_date, status, package_id) values ($1, $2, $3, 'attended', $4)", [clinicId, p, date, pkg]);
    }
    await as("insert into sessions (clinic_id, patient_id, session_date, status, charge) values ($1, $2, '2026-09-08', 'attended', 1000)", [clinicId, p]);
    await as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-09-10', 'missed')", [clinicId, p]);
    await as("insert into charges (clinic_id, patient_id, charge_date, description, amount) values ($1, $2, '2026-09-12', 'Brace', 800)", [clinicId, p]);
    await as("insert into charges (clinic_id, patient_id, charge_date, description, amount) values ($1, $2, '2026-09-12', 'Discount', -300)", [clinicId, p]);
    await as("insert into payments (clinic_id, patient_id, amount) values ($1, $2, 3000)", [clinicId, p]);

    const [s] = await as<Record<string, string | number>>(
      "select sessions_bought, sessions_used, sessions_left, visits, sessions_prior, amount_billed, amount_paid, amount_due from patient_summary where id = $1",
      [p],
    );
    expect(s.sessions_bought).toBe(10);
    expect(s.sessions_used).toBe(5); // 2 before the app + 3 dated
    expect(s.sessions_left).toBe(5);
    expect(s.visits).toBe(6); // 2 before + 4 attended
    expect(s.sessions_prior).toBe(2);
    expect(Number(s.amount_billed)).toBe(5000 + 1000 + 800 - 300);
    expect(Number(s.amount_paid)).toBe(3000);
    expect(Number(s.amount_due)).toBe(3500);
  });

  it("shows overpayment as a negative amount due (advance)", async () => {
    const [{ id: p }] = await as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'Meena') returning id", [clinicId]);
    await as("insert into payments (clinic_id, patient_id, amount) values ($1, $2, 500)", [clinicId, p]);
    const [s] = await as<{ amount_due: string }>("select amount_due from patient_summary where id = $1", [p]);
    expect(Number(s.amount_due)).toBe(-500);
  });
});

describe("constraints reject bad data", () => {
  const rejects = async (sql: string, params: unknown[] = []) => {
    await expect(as(sql, params)).rejects.toThrow();
  };

  it("on fees", async () => {
    await rejects("insert into rates (clinic_id, kind, amount, effective_from) values ($1, 'visit', 500, '2026-01-01')", [clinicId]); // visit fee needs a type
    await rejects("insert into rates (clinic_id, kind, effective_from) values ($1, 'no_show', '2026-01-01')", [clinicId]); // clinic fee needs an amount
  });

  it("on charges, pain scores and schedules", async () => {
    const [{ id: p }] = await as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'X') returning id", [clinicId]);
    await rejects("insert into charges (clinic_id, patient_id, charge_date, description, amount) values ($1, $2, '2026-01-01', 'x', 0)", [clinicId, p]);
    await rejects("insert into sessions (clinic_id, patient_id, session_date, status, pain_score) values ($1, $2, '2026-01-01', 'attended', 11)", [clinicId, p]);
    await rejects("insert into schedules (clinic_id, patient_id, mode, valid_from) values ($1, $2, 'fixed_days', '2026-01-01')", [clinicId, p]); // no days
    await rejects("insert into schedules (clinic_id, patient_id, mode, weekdays, valid_from) values ($1, $2, 'fixed_days', '{8}', '2026-01-01')", [clinicId, p]);
  });

  it("on days off", async () => {
    await rejects("insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-10-10', '2026-10-09', 'clinic')", [clinicId]);
    await rejects("insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-10-10', '2026-10-10', 'patient')", [clinicId]);
  });
});
