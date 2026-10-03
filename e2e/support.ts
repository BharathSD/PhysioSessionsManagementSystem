// Shared helpers for the browser tests: a fresh test account per test file,
// demo patients covering every billing case, sign-in, and cleanup.

import { existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Prefer a dedicated test project (.env.test.local); fall back to .env.local.
for (const file of [".env.test.local", ".env.local"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional: lets cleanup delete the test login too

export const TZ = "Asia/Kolkata";
export const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
/** Date `n` days from today, YYYY-MM-DD. */
export const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** YYYY-MM-DD → DD/MM/YYYY, as typed into date fields. */
export const dmy = (iso: string) => iso.split("-").reverse().join("/");
const weekday = (n: number) => ((new Date(`${day(n)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export type Account = {
  email: string;
  password: string;
  sb: SupabaseClient;
  clinicId: string;
  types: Record<"clinic" | "home" | "online" | "assessment", string>;
};

type Result<T> = { data: T; error: { message: string } | null };

/** A read that must return a row. */
function must<T>(r: Result<T>): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  if (r.data == null) throw new Error("Expected a row, got none");
  return r.data as NonNullable<T>;
}

/** A write that must succeed. */
function check(r: Result<unknown>) {
  if (r.error) throw new Error(r.error.message);
}

/** Signs up a throwaway physio. Supabase "Confirm email" must be off for the test project. */
export async function createAccount(): Promise<Account> {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `uitest.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = `T3st-${Math.random().toString(36).slice(2)}!`;
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Dr. Test Physio", clinic_name: "UI Test Clinic (delete me)" } },
  });
  if (error) throw new Error(`Sign-up failed: ${error.message}`);
  if (!data.session) throw new Error("Sign-up needs email confirmation — turn off 'Confirm email' in the test Supabase project.");

  const { clinic_id } = must(await sb.from("clinic_members").select("clinic_id").single());
  const vt = must(await sb.from("visit_types").select("id, name"));
  const id = (name: string) => vt.find((t) => t.name === name)!.id;
  return {
    email,
    password,
    sb,
    clinicId: clinic_id,
    types: { clinic: id("In-clinic session"), home: id("Home visit"), online: id("Online session"), assessment: id("Assessment") },
  };
}

/** Removes everything the account created. Deletes the login itself only if a service key is available. */
export async function deleteAccount(acct: Account) {
  await acct.sb.from("patients").delete().eq("clinic_id", acct.clinicId);
  await acct.sb.from("days_off").delete().eq("clinic_id", acct.clinicId);
  if (SERVICE_KEY) {
    const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
    await admin.from("clinics").delete().eq("id", acct.clinicId);
    const { data } = await acct.sb.auth.getUser();
    if (data.user) await admin.auth.admin.deleteUser(data.user.id);
  }
}

/** Standard fees plus five patients covering packages, home visits, own fees, paper records and bookings. */
export async function seedDemo(acct: Account) {
  const { sb, clinicId, types } = acct;
  const rate = (f: Record<string, unknown>) => ({ clinic_id: clinicId, patient_id: null, visit_type_id: null, kind: "visit", effective_from: "2026-01-01", ...f });
  check(
    await sb.from("rates").insert([
      rate({ visit_type_id: types.clinic, amount: 600 }),
      rate({ visit_type_id: types.clinic, amount: 700, effective_from: day(-1) }),
      rate({ visit_type_id: types.home, amount: 1000 }),
      rate({ visit_type_id: types.online, amount: 500 }),
      rate({ visit_type_id: types.assessment, amount: 800 }),
      rate({ kind: "no_show", amount: 300 }),
      rate({ kind: "cancellation", amount: 200 }),
    ]),
  );
  const patient = async (f: Record<string, unknown>) => must(await sb.from("patients").insert({ clinic_id: clinicId, ...f }).select("id").single()).id as string;
  const visit = (f: Record<string, unknown>) => ({ clinic_id: clinicId, status: "attended", charge: 0, ...f });

  // Rahul: in-clinic package, schedule includes today, home visit on one weekday, part paid.
  const rahul = await patient({ name: "Rahul Sharma", phone: "+919876500001", condition: "Knee rehab", default_visit_type_id: types.clinic });
  const rPkg = must(
    await sb
      .from("packages")
      .insert({ clinic_id: clinicId, patient_id: rahul, total_sessions: 10, price: 5000, title: "Knee rehab", start_date: day(-21), visit_type_id: types.clinic })
      .select("id")
      .single(),
  ).id;
  check(await sb.from("payments").insert({ clinic_id: clinicId, patient_id: rahul, amount: 3000, paid_on: day(-21), method: "upi" }));
  check(
    await sb.from("sessions").insert([
      ...[-21, -19, -16, -14, -12, -9].map((n, i) => visit({ patient_id: rahul, session_date: day(n), visit_type_id: types.clinic, package_id: rPkg, pain_score: 8 - i })),
      visit({ patient_id: rahul, session_date: day(-5), visit_type_id: types.home, charge: 1000 }),
    ]),
  );
  check(
    await sb.from("schedules").insert({
      clinic_id: clinicId,
      patient_id: rahul,
      mode: "fixed_days",
      weekdays: [weekday(0), weekday(2), weekday(4)].sort(),
      valid_from: day(-21),
      visit_type_id: types.clinic,
      day_visit_types: { [String(weekday(4))]: types.home },
    }),
  );

  // Arjun: pay per visit at home with his own ₹900 fee; booked tomorrow.
  const arjun = await patient({ name: "Arjun Rao", phone: "+919876500003", default_visit_type_id: types.home });
  check(await sb.from("rates").insert({ clinic_id: clinicId, patient_id: arjun, kind: "visit", visit_type_id: types.home, amount: 900, effective_from: "2026-01-01" }));
  check(await sb.from("sessions").insert([-10, -6].map((n) => visit({ patient_id: arjun, session_date: day(n), visit_type_id: types.home, charge: 900 }))));
  check(await sb.from("payments").insert({ clinic_id: clinicId, patient_id: arjun, amount: 900, paid_on: day(-10), method: "cash" }));
  check(await sb.from("appointments").insert({ clinic_id: clinicId, patient_id: arjun, scheduled_date: day(1), booked_on: day(-1), visit_type_id: types.home }));

  // Meena: online twice a week, no package.
  const meena = await patient({ name: "Meena Iyer", phone: "+919876500002", default_visit_type_id: types.online });
  check(
    await sb
      .from("schedules")
      .insert({ clinic_id: clinicId, patient_id: meena, mode: "flexible", sessions_per_period: 2, every_n_weeks: 1, valid_from: day(-30), visit_type_id: types.online }),
  );
  check(await sb.from("sessions").insert([-7, -4].map((n) => visit({ patient_id: meena, session_date: day(n), visit_type_id: types.online, charge: 500 }))));

  // Fatima: moved from paper (8 sessions before the app); expected yesterday but not marked.
  const fatima = await patient({ name: "Fatima Khan", phone: "+447700900123", default_visit_type_id: types.clinic });
  check(
    await sb.from("packages").insert({ clinic_id: clinicId, patient_id: fatima, total_sessions: 12, price: 7200, start_date: day(-45), sessions_used_before: 8 }),
  );
  check(await sb.from("schedules").insert({ clinic_id: clinicId, patient_id: fatima, mode: "fixed_days", weekdays: [weekday(-1)], valid_from: day(-60), visit_type_id: types.clinic }));

  // Suresh: an assessment booked for today.
  const suresh = await patient({ name: "Suresh Patel", phone: "+919876500005", default_visit_type_id: types.clinic });
  check(await sb.from("appointments").insert({ clinic_id: clinicId, patient_id: suresh, scheduled_date: day(0), booked_on: day(-2), visit_type_id: types.assessment }));

  return { rahul, arjun, meena, fatima, suresh };
}

export async function signIn(page: Page, acct: Pick<Account, "email" | "password">) {
  await page.goto("/login");
  await page.fill('input[name="email"]', acct.email);
  await page.fill('input[name="password"]', acct.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/$/);
}

/** Types a date into the date field with this label. */
export async function fillDate(page: Page, label: string, iso: string) {
  await page.locator(".field", { hasText: label }).locator('input[placeholder="DD/MM/YYYY"]').first().fill(dmy(iso));
}
