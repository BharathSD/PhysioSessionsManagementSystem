import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, signUp, USER_A, USER_B } from "./helpers";

// Row-level security: a physio must never see or change another clinic's data.

let db: PGlite;
let a: Awaited<ReturnType<typeof signUp>>;
let b: Awaited<ReturnType<typeof signUp>>;
let patientA: string;

const TABLES = [
  "clinics",
  "clinic_members",
  "patients",
  "packages",
  "sessions",
  "payments",
  "schedules",
  "appointments",
  "visit_types",
  "rates",
  "charges",
  "days_off",
  "day_off_notices",
  "patient_summary",
];

beforeAll(async () => {
  db = await freshDb();
  a = await signUp(db, USER_A);
  b = await signUp(db, USER_B);
  // Give clinic A one row in every table.
  [{ id: patientA }] = await a.as<{ id: string }>("insert into patients (clinic_id, name, phone) values ($1, 'Rahul', '+919876543210') returning id", [a.clinicId]);
  const [{ id: pkg }] = await a.as<{ id: string }>("insert into packages (clinic_id, patient_id, total_sessions, price) values ($1, $2, 10, 5000) returning id", [a.clinicId, patientA]);
  await a.as("insert into sessions (clinic_id, patient_id, session_date, status, package_id) values ($1, $2, '2026-10-01', 'attended', $3)", [a.clinicId, patientA, pkg]);
  await a.as("insert into payments (clinic_id, patient_id, amount) values ($1, $2, 1000)", [a.clinicId, patientA]);
  await a.as("insert into schedules (clinic_id, patient_id, mode, weekdays, valid_from) values ($1, $2, 'fixed_days', '{1,3,5}', '2026-10-01')", [a.clinicId, patientA]);
  await a.as("insert into appointments (clinic_id, patient_id, scheduled_date) values ($1, $2, '2026-10-10')", [a.clinicId, patientA]);
  await a.as("insert into charges (clinic_id, patient_id, charge_date, description, amount) values ($1, $2, '2026-10-01', 'Brace', 800)", [a.clinicId, patientA]);
  await a.as("insert into rates (clinic_id, kind, amount, effective_from) values ($1, 'no_show', 300, '2026-01-01')", [a.clinicId]);
  const [{ id: off }] = await a.as<{ id: string }>(
    "insert into days_off (clinic_id, from_date, to_date, cancelled_by) values ($1, '2026-10-20', '2026-10-24', 'clinic') returning id",
    [a.clinicId],
  );
  await a.as("insert into day_off_notices (day_off_id, clinic_id, patient_id) values ($1, $2, $3)", [off, a.clinicId, patientA]);
});

describe("clinic A can see its own data", () => {
  it.each(TABLES)("%s", async (table) => {
    expect((await a.as(`select * from ${table}`)).length).toBeGreaterThan(0);
  });
});

describe("clinic B sees none of clinic A's data", () => {
  it.each(TABLES)("%s", async (table) => {
    const rows = await b.as<{ clinic_id?: string; id?: string }>(`select * from ${table}`);
    expect(rows.filter((r) => r.clinic_id === a.clinicId || r.id === a.clinicId)).toEqual([]);
  });
});

describe("clinic B can't change clinic A's data", () => {
  it("can't add a patient to clinic A", async () => {
    await expect(b.as("insert into patients (clinic_id, name) values ($1, 'Sneaky')", [a.clinicId])).rejects.toThrow(/row-level security/);
  });

  it("can't attach a visit to clinic A's patient", async () => {
    await expect(
      b.as("insert into sessions (clinic_id, patient_id, session_date, status) values ($1, $2, '2026-10-02', 'attended')", [b.clinicId, patientA]),
    ).rejects.toThrow();
  });

  it("can't edit or delete clinic A's rows", async () => {
    expect(await b.as("update patients set name = 'Hacked' where id = $1 returning id", [patientA])).toEqual([]);
    expect(await b.as("update clinics set name = 'Hacked' where id = $1 returning id", [a.clinicId])).toEqual([]);
    expect(await b.as("delete from payments where clinic_id = $1 returning id", [a.clinicId])).toEqual([]);
    const [{ name }] = await a.as<{ name: string }>("select name from patients where id = $1", [patientA]);
    expect(name).toBe("Rahul");
  });
});

describe("signed-out visitors", () => {
  it.each(TABLES)("can't read %s", async (table) => {
    await db.exec("set role anon;");
    try {
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role;");
    }
  });
});
