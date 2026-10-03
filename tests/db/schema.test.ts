import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigration, freshDb, migrationFiles, signUp, USER_A, USER_B } from "./helpers";

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
    // "Dr." typed into the name is stored as the designation.
    expect(await as("select role, designation, display_name from clinic_members")).toEqual([{ role: "owner", designation: "Dr.", display_name: "Priya" }]);
    const types = await as<{ name: string }>("select name from visit_types order by sort");
    expect(types.map((t) => t.name)).toEqual(["In-clinic session", "Home visit", "Online session", "Assessment"]);
  });
});

describe("designation", () => {
  it("is taken from the sign-up form, and an unknown one is dropped", async () => {
    const db2 = await freshDb();
    const a = await signUp(db2, USER_A, { full_name: "Anil Kumar", designation: "Prof." });
    expect(await a.as("select designation, display_name from clinic_members")).toEqual([{ designation: "Prof.", display_name: "Anil Kumar" }]);
    const b = await signUp(db2, USER_B, { full_name: "Meera", designation: "Sir" });
    expect(await b.as("select designation, display_name from clinic_members")).toEqual([{ designation: "", display_name: "Meera" }]);
  });

  it("is split out of names saved before it existed", { timeout: 120_000 }, async () => {
    const old = await freshDb("0008_designation.sql");
    const a = await signUp(old, USER_A, { full_name: "dr priya sharma" });
    const b = await signUp(old, USER_B, { full_name: "Drishti Rao" });
    await applyMigration(old, "0008_designation.sql");
    expect(await a.as("select designation, display_name from clinic_members")).toEqual([{ designation: "Dr.", display_name: "priya sharma" }]);
    expect(await b.as("select designation, display_name from clinic_members")).toEqual([{ designation: "", display_name: "Drishti Rao" }]);
  });
});

describe("patient title", () => {
  it("is split out of names saved before it existed and shows in the summary", { timeout: 120_000 }, async () => {
    const old = await freshDb("0009_patient_title.sql");
    const a = await signUp(old, USER_A);
    await a.as("insert into patients (clinic_id, name) values ($1, 'mrs lakshmi iyer'), ($1, 'Master Arjun'), ($1, 'Mrinal')", [a.clinicId]);
    await applyMigration(old, "0009_patient_title.sql");
    expect(await a.as("select title, name from patient_summary order by name")).toEqual([
      { title: "", name: "Master Arjun" }, // "Master" can be a real first name: left for the physio to set
      { title: "", name: "Mrinal" },
      { title: "Mrs.", name: "lakshmi iyer" },
    ]);
    await expect(a.as("update patients set title = 'Sir'")).rejects.toThrow();
  });
});

describe("contact details (0010)", () => {
  it("splits titles and relationships out of what was typed before", { timeout: 120_000 }, async () => {
    const old = await freshDb("0010_contact_details.sql");
    const a = await signUp(old, USER_A);
    await a.as(
      "insert into patients (clinic_id, name, referred_by, emergency_name) values ($1, 'A', 'Dr. Mehta, ortho', 'Mrs. Anita (wife)'), ($1, 'B', 'Self', 'Ravi')",
      [a.clinicId],
    );
    await applyMigration(old, "0010_contact_details.sql");
    expect(await a.as("select referred_by_title, referred_by, emergency_title, emergency_name, emergency_relation from patients order by name")).toEqual([
      { referred_by_title: "Dr.", referred_by: "Mehta, ortho", emergency_title: "Mrs.", emergency_name: "Anita", emergency_relation: "wife" },
      { referred_by_title: "", referred_by: "Self", emergency_title: "", emergency_name: "Ravi", emergency_relation: null },
    ]);
    // A map pin needs both coordinates.
    await expect(a.as("update patients set latitude = 19.1")).rejects.toThrow();
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

  it("on cases, pain assessments and session records", async () => {
    const [{ id: p }] = await as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'Case test') returning id", [clinicId]);
    // a discharged case needs a discharge date, and it can't be before the case opened
    await rejects("insert into cases (clinic_id, patient_id, title, opened_on, status) values ($1, $2, 'x', '2026-09-01', 'discharged')", [clinicId, p]);
    await rejects("insert into cases (clinic_id, patient_id, title, opened_on, status, closed_on) values ($1, $2, 'x', '2026-09-01', 'discharged', '2026-08-01')", [
      clinicId,
      p,
    ]);
    await rejects("insert into pain_assessments (clinic_id, patient_id, assessed_on, kind, at_rest) values ($1, $2, '2026-09-01', 'initial', 11)", [clinicId, p]);
    await rejects("insert into pain_assessments (clinic_id, patient_id, assessed_on, kind) values ($1, $2, '2026-09-01', 'whenever')", [clinicId, p]);
    await rejects("insert into exercise_library (clinic_id, kind, name) values ($1, 'stretch', 'x')", [clinicId]);
  });

  it("keeps what was done in a session when the exercise is renamed or removed", async () => {
    const [{ id: p }] = await as<{ id: string }>("insert into patients (clinic_id, name) values ($1, 'Items') returning id", [clinicId]);
    const [{ id: s }] = await as<{ id: string }>(
      "insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-09-02', 'attended') returning id",
      [clinicId, p],
    );
    const [{ id: ex }] = await as<{ id: string }>("insert into exercise_library (clinic_id, kind, name) values ($1, 'exercise', 'Bridges') returning id", [clinicId]);
    await as("insert into session_items (clinic_id, session_id, item_id, kind, name, dosage) values ($1, $2, $3, 'exercise', 'Bridges', '2 × 15')", [clinicId, s, ex]);
    await as("update exercise_library set name = 'Glute bridges' where id = $1", [ex]);
    await as("delete from exercise_library where id = $1", [ex]);
    expect(await as("select name, dosage, item_id from session_items where session_id = $1", [s])).toEqual([{ name: "Bridges", dosage: "2 × 15", item_id: null }]);
  });

  it("on days off", async () => {
    await rejects("insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-10-10', '2026-10-09', 'clinic')", [clinicId]);
    await rejects("insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-10-10', '2026-10-10', 'patient')", [clinicId]);
  });
});
