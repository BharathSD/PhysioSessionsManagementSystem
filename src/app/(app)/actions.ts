"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { isCountryCode, toE164 } from "@/lib/phone";
import { addDays } from "@/lib/schedule";
import type { PaymentMethod, SessionStatus } from "@/lib/types";

export type FormState = { error?: string; ok?: string } | undefined;

type Ctx = Awaited<ReturnType<typeof getContext>>;

const STATUSES: SessionStatus[] = ["attended", "missed", "cancelled"];
const METHODS: PaymentMethod[] = ["upi", "cash", "card", "bank", "other"];

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function int(form: FormData, key: string): number {
  const n = Number(text(form, key));
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

function money(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[,₹\s]/g, "");
  return raw === "" ? 0 : Number(raw);
}

function isoDate(form: FormData, key: string): string | null {
  const v = text(form, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}

/** Phone from a PhoneField: undefined = left empty, null = invalid. */
function phoneFrom(form: FormData, clinicCountry: string): string | null | undefined {
  const raw = text(form, "phone");
  if (!raw) return undefined;
  return toE164(raw, text(form, "phone_country") || clinicCountry);
}

/** Optional per-visit rate: null = not set. */
function rateFrom(form: FormData): number | null {
  return text(form, "rate_per_session") ? money(form, "rate_per_session") : null;
}

/**
 * Payments from either the single "paid now" fields or repeated PaymentRows
 * (pay_amount[] / pay_method[] / pay_date[]). Empty rows are skipped.
 */
function paymentsFrom(form: FormData, today: string) {
  const rows: { amount: number; method: string; paid_on: string }[] = [];
  const method = (m: string) => (METHODS.includes(m as PaymentMethod) ? m : "upi");

  if (text(form, "paid_now")) {
    const amount = money(form, "paid_now");
    const paidOn = isoDate(form, "paid_on") ?? today;
    if (Number.isNaN(amount) || amount < 0) return { error: "Amount paid must be a number." };
    if (paidOn > today) return { error: "Payment date can't be in the future." };
    if (amount > 0) rows.push({ amount, method: method(text(form, "method")), paid_on: paidOn });
  }

  const amounts = form.getAll("pay_amount").map((v) => String(v).replace(/[,₹\s]/g, ""));
  const methods = form.getAll("pay_method").map(String);
  const dates = form.getAll("pay_date").map(String);
  for (let i = 0; i < amounts.length; i++) {
    if (!amounts[i]) continue;
    const amount = Number(amounts[i]);
    if (!(amount > 0)) return { error: `Payment ${i + 1}: amount must be a number.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dates[i] ?? "")) return { error: `Payment ${i + 1}: add the date it was paid.` };
    if (dates[i] > today) return { error: `Payment ${i + 1}: date can't be in the future.` };
    rows.push({ amount, method: method(methods[i]), paid_on: dates[i] });
  }
  return rows;
}

/** Dates picked in a MultiDateField. */
function pastDatesFrom(form: FormData, today: string): { attended: string[]; missed: string[] } | { error: string } {
  const clean = (key: string) => [...new Set(form.getAll(key).map(String))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const attended = clean("attended_dates");
  const missed = clean("missed_dates").filter((d) => !attended.includes(d));
  if ([...attended, ...missed].some((d) => d > today)) return { error: "Past sessions can't be in the future." };
  return { attended, missed };
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Database errors in plain words. A missing column means a migration hasn't been run yet. */
function dbError(error: { message: string }): string {
  if (/schema cache|does not exist/i.test(error.message)) {
    return "The database needs an update: run the newest file in supabase/migrations in the Supabase SQL Editor, then try again.";
  }
  return error.message;
}

/** Back to the patient's page (on a tab) with a "✓ …" confirmation banner. */
function backToPatient(patientId: string, tab: "overview" | "visits" | "payments" | "schedule", message: string): never {
  refresh();
  const qs = new URLSearchParams({ done: message });
  if (tab !== "overview") qs.set("tab", tab);
  redirect(`/patients/${patientId}?${qs}`);
}

// ---------------------------------------------------------------------------
// Treatment plans
// ---------------------------------------------------------------------------

type PlanInput = {
  mode: "fixed_days" | "flexible";
  weekdays: number[];
  every_n_weeks: number;
  sessions_per_period: number | null;
  valid_from: string;
  note: string | null;
};

/** Reads PlanFields. Returns null when "no plan" was chosen. */
function planFrom(form: FormData, today: string): PlanInput | { error: string } | null {
  const mode = text(form, "plan_mode");
  if (!mode || mode === "none") return null;
  if (mode !== "fixed_days" && mode !== "flexible") return { error: "Pick a plan type." };

  const everyN = int(form, "every_n_weeks") || 1;
  if (everyN < 1 || everyN > 8) return { error: "Repeat every 1–8 weeks." };
  const validFrom = isoDate(form, "plan_from") ?? today;

  if (mode === "fixed_days") {
    const weekdays = [...new Set(form.getAll("weekdays").map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    if (weekdays.length === 0) return { error: "Pick at least one day for the plan." };
    return { mode, weekdays, every_n_weeks: everyN, sessions_per_period: null, valid_from: validFrom, note: text(form, "plan_note") || null };
  }

  const k = int(form, "sessions_per_period");
  if (!(k >= 1 && k <= 14)) return { error: "Sessions per period must be between 1 and 14." };
  return { mode, weekdays: [], every_n_weeks: everyN, sessions_per_period: k, valid_from: validFrom, note: text(form, "plan_note") || null };
}

/**
 * Start a new plan. Plans that would overlap are ended the day before (or
 * removed if they hadn't started yet), so the patient's plan history is kept.
 */
async function startPlan({ supabase, clinic }: Ctx, patientId: string, plan: PlanInput): Promise<string | null> {
  const { data: overlapping, error } = await supabase
    .from("schedules")
    .select("id, valid_from")
    .eq("patient_id", patientId)
    .or(`valid_until.is.null,valid_until.gte.${plan.valid_from}`);
  if (error) return error.message;

  for (const old of overlapping ?? []) {
    const { error: e } =
      old.valid_from >= plan.valid_from
        ? await supabase.from("schedules").delete().eq("id", old.id)
        : await supabase.from("schedules").update({ valid_until: addDays(plan.valid_from, -1) }).eq("id", old.id);
    if (e) return e.message;
  }

  const { error: insertError } = await supabase.from("schedules").insert({ clinic_id: clinic.id, patient_id: patientId, ...plan });
  return insertError?.message ?? null;
}

export async function changePlan(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const plan = planFrom(form, todayIn(ctx.clinic.timezone));
  if (!plan) return { error: "Pick a plan type." };
  if ("error" in plan) return plan;
  const err = await startPlan(ctx, patientId, plan);
  if (err) return { error: err };
  backToPatient(patientId, "schedule", "Schedule saved");
}

/** Stop the plan after today (today still counts). Plans not started yet are removed. */
export async function endPlan(planId: string) {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const { data: plan } = await supabase.from("schedules").select("valid_from").eq("id", planId).single();
  if (!plan) return;
  const { error } =
    plan.valid_from > today
      ? await supabase.from("schedules").delete().eq("id", planId)
      : await supabase.from("schedules").update({ valid_until: today }).eq("id", planId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export async function createPatient(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const { supabase, clinic } = ctx;
  const today = todayIn(clinic.timezone);

  const name = text(form, "name");
  if (!name) return { error: "Please enter the patient's name." };

  const phone = phoneFrom(form, clinic.country);
  if (phone === null) return { error: "That phone number doesn't look right for the selected country." };

  const sessions = text(form, "sessions") ? int(form, "sessions") : 0;
  const price = money(form, "price");
  const rate = rateFrom(form);
  const usedBefore = text(form, "used_before") ? int(form, "used_before") : 0;
  if (Number.isNaN(sessions) || sessions < 0) return { error: "Number of sessions must be a whole number." };
  if (Number.isNaN(usedBefore) || usedBefore < 0) return { error: "“Already used” must be a whole number." };
  if (usedBefore > 0 && sessions === 0) return { error: "Add the package these used sessions belong to." };
  if ([price, rate ?? 0].some((n) => Number.isNaN(n) || n < 0)) return { error: "Amounts must be numbers." };
  const packageStart = isoDate(form, "package_start") ?? today;
  if (packageStart > today) return { error: "Package start date can't be in the future." };

  const payments = paymentsFrom(form, today);
  if ("error" in payments) return payments;

  const past = pastDatesFrom(form, today);
  if ("error" in past) return past;

  const plan = planFrom(form, today);
  if (plan && "error" in plan) return plan;

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({ clinic_id: clinic.id, name, phone: phone ?? null, condition: text(form, "condition") || null, rate_per_session: rate })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "A patient with this phone number already exists." : dbError(error) };
  }

  // All or nothing: if anything below fails, remove the half-saved patient
  // (packages, payments, visits and schedules go with it) so a retry works.
  const failed = async (message: string): Promise<FormState> => {
    await supabase.from("patients").delete().eq("id", patient.id);
    return { error: message };
  };

  let packageId: string | null = null;
  if (sessions > 0) {
    const { data: pkg, error: pkgError } = await supabase
      .from("packages")
      .insert({
        clinic_id: clinic.id,
        patient_id: patient.id,
        title: text(form, "package_title") || `${sessions} sessions`,
        total_sessions: sessions,
        price,
        start_date: packageStart,
        ...(usedBefore > 0 && { sessions_used_before: usedBefore }),
      })
      .select("id")
      .single();
    if (pkgError) return failed(dbError(pkgError));
    packageId = pkg.id;
  }

  if (payments.length > 0) {
    const { error: payError } = await supabase
      .from("payments")
      .insert(payments.map((pay) => ({ clinic_id: clinic.id, patient_id: patient.id, package_id: packageId, ...pay })));
    if (payError) return failed(dbError(payError));
  }

  if (past.attended.length + past.missed.length > 0) {
    const result = await insertPastSessions(ctx, patient.id, past.attended, past.missed);
    if ("error" in result) return failed(result.error);
  }

  if (plan) {
    const err = await startPlan(ctx, patient.id, plan);
    if (err) return failed(err);
  }

  backToPatient(patient.id, "overview", `${name} added`);
}

export async function updatePatient(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const name = text(form, "name");
  if (!name) return { error: "Name can't be empty." };
  const phone = phoneFrom(form, clinic.country);
  if (phone === null) return { error: "That phone number doesn't look right for the selected country." };
  const rate = rateFrom(form);
  if (rate !== null && (Number.isNaN(rate) || rate < 0)) return { error: "Rate must be a number." };

  const { error } = await supabase
    .from("patients")
    .update({ name, phone: phone ?? null, condition: text(form, "condition") || null, rate_per_session: rate })
    .eq("id", patientId);
  if (error) return { error: error.code === "23505" ? "Another patient already has this phone number." : error.message };
  backToPatient(patientId, "overview", "Details saved");
}

export async function setArchived(patientId: string, archived: boolean) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("patients").update({ archived }).eq("id", patientId);
  if (error) throw new Error(error.message);
  if (archived) {
    refresh();
    redirect(`/patients?${new URLSearchParams({ done: "Patient archived" })}`);
  }
  backToPatient(patientId, "overview", "Patient restored");
}

// ---------------------------------------------------------------------------
// Sessions (attendance)
// ---------------------------------------------------------------------------

async function insertSession(patientId: string, status: SessionStatus, date: string, notes: string | null) {
  const { supabase, clinic } = await getContext();

  // Link the visit to the patient's most recent package (informational; the
  // balance is computed across all packages) and to a booking for that day.
  const [{ data: pkg }, { data: booking }] = await Promise.all([
    supabase.from("packages").select("id").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("appointments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("scheduled_date", date)
      .eq("status", "booked")
      .limit(1)
      .maybeSingle(),
  ]);

  const { error } = await supabase.from("sessions").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    package_id: pkg?.id ?? null,
    appointment_id: booking?.id ?? null,
    session_date: date,
    status,
    notes,
  });
  if (error) throw new Error(error.message);
  refresh();
}

/** One-tap attendance for today, used by the Today screen and patient page. */
export async function markToday(patientId: string, status: SessionStatus) {
  const { clinic } = await getContext();
  if (!STATUSES.includes(status)) throw new Error("Invalid status");
  await insertSession(patientId, status, todayIn(clinic.timezone), null);
}

export async function deleteSession(sessionId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  refresh();
}

/**
 * Insert many past visits at once (moving from paper records, or catching up).
 * Days that already have a visit for this patient are skipped. Each visit is
 * linked to the latest package that had started by then.
 */
async function insertPastSessions(
  { supabase, clinic }: Ctx,
  patientId: string,
  attended: string[],
  missed: string[],
): Promise<{ added: number; skipped: number } | { error: string }> {
  const all = [...attended.map((d) => [d, "attended"] as const), ...missed.map((d) => [d, "missed"] as const)];
  const [{ data: existing }, { data: pkgs }] = await Promise.all([
    supabase.from("sessions").select("session_date").eq("patient_id", patientId).in("session_date", all.map(([d]) => d)),
    supabase.from("packages").select("id, start_date").eq("patient_id", patientId).order("start_date", { ascending: false }),
  ]);
  const taken = new Set((existing ?? []).map((s) => s.session_date as string));
  const packageFor = (date: string) => (pkgs ?? []).find((p) => p.start_date <= date)?.id ?? pkgs?.at(-1)?.id ?? null;

  const rows = all
    .filter(([d]) => !taken.has(d))
    .map(([session_date, status]) => ({
      clinic_id: clinic.id,
      patient_id: patientId,
      package_id: packageFor(session_date),
      session_date,
      status,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from("sessions").insert(rows);
    if (error) return { error: error.message };
  }
  return { added: rows.length, skipped: all.length - rows.length };
}

export async function addPastSessions(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const past = pastDatesFrom(form, todayIn(ctx.clinic.timezone));
  if ("error" in past) return past;
  if (past.attended.length + past.missed.length === 0) return { error: "Tap the dates on the calendar first." };

  const result = await insertPastSessions(ctx, patientId, past.attended, past.missed);
  if ("error" in result) return result;
  const n = result.added;
  backToPatient(
    patientId,
    "visits",
    `${n} session${n === 1 ? "" : "s"} added${result.skipped ? ` (${result.skipped} already recorded)` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export async function bookSession(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const scheduled = isoDate(form, "scheduled_date");
  const bookedOn = isoDate(form, "booked_on") ?? today;
  if (!scheduled) return { error: "Pick the session date." };
  if (scheduled < today) return { error: "That date has passed — use “Add a past session” instead." };
  if (bookedOn > today) return { error: "Booked-on date can't be in the future." };
  if (bookedOn > scheduled) return { error: "Booked-on date can't be after the session date." };

  const { error } = await supabase.from("appointments").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    scheduled_date: scheduled,
    booked_on: bookedOn,
    note: text(form, "note") || null,
  });
  if (error) return { error: error.message };
  backToPatient(patientId, "overview", "Session booked");
}

export async function cancelBooking(appointmentId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Packages & payments
// ---------------------------------------------------------------------------

export async function addPackage(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const sessions = int(form, "sessions");
  const price = money(form, "price");
  const usedBefore = text(form, "used_before") ? int(form, "used_before") : 0;
  const startDate = isoDate(form, "start_date") ?? today;
  if (!(sessions > 0)) return { error: "Enter how many sessions are in the package." };
  if (Number.isNaN(price) || price < 0) return { error: "Price must be a number." };
  if (Number.isNaN(usedBefore) || usedBefore < 0) return { error: "“Already used” must be a whole number." };
  if (startDate > today) return { error: "Start date can't be in the future." };

  const { error } = await supabase.from("packages").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    title: text(form, "title") || `${sessions} sessions`,
    total_sessions: sessions,
    price,
    start_date: startDate,
    ...(usedBefore > 0 && { sessions_used_before: usedBefore }),
  });
  if (error) return { error: dbError(error) };
  backToPatient(patientId, "payments", "Package added");
}

export async function deletePackage(packageId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("packages").delete().eq("id", packageId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function recordPayment(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const amount = money(form, "amount");
  const method = text(form, "method") as PaymentMethod;
  const paidOn = isoDate(form, "paid_on") ?? today;
  if (!(amount > 0)) return { error: "Enter the amount received." };
  if (!METHODS.includes(method)) return { error: "Pick a payment method." };
  if (paidOn > today) return { error: "Payment date can't be in the future." };

  const { error } = await supabase.from("payments").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    amount,
    method,
    paid_on: paidOn,
    note: text(form, "note") || null,
  });
  if (error) return { error: error.message };
  backToPatient(patientId, "payments", "Payment recorded");
}

export async function deletePayment(paymentId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic, member, userId } = await getContext();

  const displayName = text(form, "display_name");
  const clinicName = text(form, "clinic_name");
  if (!displayName) return { error: "Your name is required." };

  const { error: memberError } = await supabase
    .from("clinic_members")
    .update({ display_name: displayName })
    .eq("clinic_id", clinic.id)
    .eq("user_id", userId);
  if (memberError) return { error: memberError.message };

  if (member.role === "owner") {
    if (!clinicName) return { error: "Clinic name is required." };
    const country = text(form, "country");
    if (!isCountryCode(country)) return { error: "Pick a country." };
    const phone = phoneFrom(form, country);
    if (phone === null) return { error: "Clinic phone doesn't look right." };

    const { error } = await supabase
      .from("clinics")
      .update({ name: clinicName, upi_id: text(form, "upi_id") || null, phone: phone ?? null, country })
      .eq("id", clinic.id);
    if (error) return { error: error.message };
  }

  refresh();
  return { ok: "Saved" };
}
