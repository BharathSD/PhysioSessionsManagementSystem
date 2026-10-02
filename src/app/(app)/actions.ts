"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { priceVisit, type VisitOutcome } from "@/lib/fees";
import { todayIn } from "@/lib/format";
import { isCountryCode, toE164 } from "@/lib/phone";
import { addDays } from "@/lib/schedule";
import type { PaymentMethod, RateKind } from "@/lib/types";

export type FormState = { error?: string; ok?: string } | undefined;

type Ctx = Awaited<ReturnType<typeof getContext>>;

const STATUSES: VisitOutcome[] = ["attended", "missed", "cancelled_patient", "cancelled_clinic"];
const METHODS: PaymentMethod[] = ["upi", "cash", "card", "bank", "other"];
const RATE_KINDS: RateKind[] = ["visit", "no_show", "cancellation"];

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

/** A visit type id from the form, only if it belongs to this clinic. */
async function visitTypeFrom(form: FormData, key = "visit_type_id"): Promise<string | null> {
  const id = text(form, key);
  if (!id) return null;
  const { visitTypes } = await getBilling();
  return visitTypes.some((t) => t.id === id) ? id : null;
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

type PatientTab = "overview" | "visits" | "account" | "schedule";

/** Back to the patient's page (on a tab) with a "✓ …" confirmation banner. */
function backToPatient(patientId: string, tab: PatientTab, message: string): never {
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
  visit_type_id: string | null;
  day_visit_types: Record<string, string>;
};

/** Reads PlanFields. Returns null when "no schedule" was chosen. */
async function planFrom(form: FormData, today: string): Promise<PlanInput | { error: string } | null> {
  const mode = text(form, "plan_mode");
  if (!mode || mode === "none") return null;
  if (mode !== "fixed_days" && mode !== "flexible") return { error: "Pick a schedule type." };

  const everyN = int(form, "every_n_weeks") || 1;
  if (everyN < 1 || everyN > 8) return { error: "Repeat every 1–8 weeks." };
  const validFrom = isoDate(form, "plan_from") ?? today;
  const visitType = await visitTypeFrom(form, "plan_visit_type");
  const base = { every_n_weeks: everyN, valid_from: validFrom, note: text(form, "plan_note") || null, visit_type_id: visitType };

  if (mode === "fixed_days") {
    const weekdays = [...new Set(form.getAll("weekdays").map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    if (weekdays.length === 0) return { error: "Pick at least one day." };
    // Mixed schedules: a different visit type on some days.
    const dayTypes: Record<string, string> = {};
    for (const d of weekdays) {
      const t = await visitTypeFrom(form, `day_type_${d}`);
      if (t && t !== visitType) dayTypes[String(d)] = t;
    }
    return { ...base, mode, weekdays, sessions_per_period: null, day_visit_types: dayTypes };
  }

  const k = int(form, "sessions_per_period");
  if (!(k >= 1 && k <= 14)) return { error: "Sessions per period must be between 1 and 14." };
  return { ...base, mode, weekdays: [], sessions_per_period: k, day_visit_types: {} };
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
  return insertError ? dbError(insertError) : null;
}

export async function changePlan(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const plan = await planFrom(form, todayIn(ctx.clinic.timezone));
  if (!plan) return { error: "Pick a schedule type." };
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

  const visitType = await visitTypeFrom(form);
  const sessions = text(form, "sessions") ? int(form, "sessions") : 0;
  const price = money(form, "price");
  const customFee = text(form, "custom_fee") ? money(form, "custom_fee") : null;
  const usedBefore = text(form, "used_before") ? int(form, "used_before") : 0;
  if (Number.isNaN(sessions) || sessions < 0) return { error: "Number of sessions must be a whole number." };
  if (Number.isNaN(usedBefore) || usedBefore < 0) return { error: "“Sessions already done” must be a whole number." };
  if (usedBefore > 0 && sessions === 0) return { error: "Add the package these sessions belong to." };
  if ([price, customFee ?? 0].some((n) => Number.isNaN(n) || n < 0)) return { error: "Amounts must be numbers." };
  const packageStart = isoDate(form, "package_start") ?? today;
  if (packageStart > today) return { error: "Package start date can't be in the future." };

  const payments = paymentsFrom(form, today);
  if ("error" in payments) return payments;

  const past = pastDatesFrom(form, today);
  if ("error" in past) return past;

  const plan = await planFrom(form, today);
  if (plan && "error" in plan) return plan;

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({ clinic_id: clinic.id, name, phone: phone ?? null, condition: text(form, "condition") || null, default_visit_type_id: visitType })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "A patient with this phone number already exists." : dbError(error) };
  }

  // All or nothing: if anything below fails, remove the half-saved patient
  // (packages, payments, visits, fees and schedules go with it) so a retry works.
  const failed = async (message: string): Promise<FormState> => {
    await supabase.from("patients").delete().eq("id", patient.id);
    return { error: message };
  };

  if (customFee !== null && visitType) {
    // Applies from the earliest date we have for this patient, so old visits use it too.
    const from = [today, packageStart, ...past.attended, ...past.missed].sort()[0];
    const { error: feeError } = await supabase
      .from("rates")
      .insert({ clinic_id: clinic.id, patient_id: patient.id, kind: "visit", visit_type_id: visitType, amount: customFee, effective_from: from });
    if (feeError) return failed(dbError(feeError));
  }

  if (sessions > 0) {
    const { error: pkgError } = await supabase.from("packages").insert({
      clinic_id: clinic.id,
      patient_id: patient.id,
      title: text(form, "package_title") || `${sessions} sessions`,
      total_sessions: sessions,
      price,
      start_date: packageStart,
      visit_type_id: await visitTypeFrom(form, "package_visit_type"),
      sessions_used_before: usedBefore,
    });
    if (pkgError) return failed(dbError(pkgError));
  }

  if (payments.length > 0) {
    const { error: payError } = await supabase
      .from("payments")
      .insert(payments.map((pay) => ({ clinic_id: clinic.id, patient_id: patient.id, ...pay })));
    if (payError) return failed(dbError(payError));
  }

  if (past.attended.length + past.missed.length > 0) {
    const result = await insertPastSessions(ctx, patient.id, past.attended, past.missed, visitType);
    if ("error" in result) return failed(result.error);
  }

  if (plan) {
    const err = await startPlan(ctx, patient.id, { ...plan, visit_type_id: plan.visit_type_id ?? visitType });
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

  const { error } = await supabase
    .from("patients")
    .update({ name, phone: phone ?? null, condition: text(form, "condition") || null, default_visit_type_id: await visitTypeFrom(form) })
    .eq("id", patientId);
  if (error) return { error: error.code === "23505" ? "Another patient already has this phone number." : dbError(error) };
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
// Attendance. The price is worked out when the visit is recorded, using the
// fee in force on the visit's date, and stored on the visit.
// ---------------------------------------------------------------------------

type VisitInput = { date: string; status: VisitOutcome; visitTypeId: string | null; chargeIt: boolean; notes: string | null };

async function recordVisit(ctx: Ctx, patientId: string, v: VisitInput): Promise<{ id: string } | { error: string }> {
  const { supabase, clinic } = ctx;
  const [{ rates }, slots, { data: existing }, { data: booking }] = await Promise.all([
    getBilling(),
    packageSlots(ctx, patientId),
    supabase.from("sessions").select("id").eq("patient_id", patientId).eq("session_date", v.date).limit(1).maybeSingle(),
    supabase
      .from("appointments")
      .select("id, visit_type_id")
      .eq("patient_id", patientId)
      .eq("scheduled_date", v.date)
      .eq("status", "booked")
      .limit(1)
      .maybeSingle(),
  ]);
  if (existing) return { error: "This day is already marked. Undo it first to change it." };

  const visitTypeId = v.visitTypeId ?? booking?.visit_type_id ?? null;
  const priced = priceVisit({ rates, slots, patientId, date: v.date, status: v.status, visitTypeId, chargeIt: v.chargeIt });
  if ("error" in priced) return priced;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      appointment_id: booking?.id ?? null,
      session_date: v.date,
      status: v.status,
      visit_type_id: visitTypeId,
      notes: v.notes,
      ...priced,
    })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  return data;
}

/** One-tap Present / Absent for today (Today screen and patient page). */
export async function markToday(patientId: string, status: "attended" | "missed", visitTypeId: string | null) {
  const ctx = await getContext();
  const result = await recordVisit(ctx, patientId, {
    date: todayIn(ctx.clinic.timezone),
    status,
    visitTypeId,
    chargeIt: false,
    notes: null,
  });
  if ("error" in result) throw new Error(result.error);
  refresh();
}

/** Full attendance form: any outcome, visit type, optional fee, optional reschedule. */
export async function recordAttendance(patientId: string, date: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const today = todayIn(ctx.clinic.timezone);
  const status = text(form, "status") as VisitOutcome;
  if (!STATUSES.includes(status)) return { error: "Pick what happened." };
  if (date > today) return { error: "You can't mark a day that hasn't happened yet." };

  const reschedule = status === "attended" ? null : isoDate(form, "reschedule_date");
  if (reschedule && reschedule <= date) return { error: "Pick a new date after the cancelled one." };

  const visitTypeId = await visitTypeFrom(form);
  const result = await recordVisit(ctx, patientId, {
    date,
    status,
    visitTypeId,
    chargeIt: status !== "attended" && text(form, "charge") === "on",
    notes: text(form, "notes") || null,
  });
  if ("error" in result) return result;

  if (reschedule) {
    const { error } = await ctx.supabase.from("appointments").insert({
      clinic_id: ctx.clinic.id,
      patient_id: patientId,
      scheduled_date: reschedule,
      booked_on: today,
      visit_type_id: visitTypeId,
      rescheduled_from: result.id,
      note: `Rescheduled from ${date}`,
    });
    if (error) return { error: dbError(error) };
  }
  backToPatient(patientId, "visits", reschedule ? "Saved and rescheduled" : "Attendance saved");
}

/** Charge (or stop charging) an absence or patient cancellation after it was marked. */
export async function setSessionCharged(sessionId: string, charged: boolean) {
  const ctx = await getContext();
  const { supabase } = ctx;
  const { data: s } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  if (!s || s.status === "attended" || s.status === "cancelled_clinic") return;

  let update = { package_id: null as string | null, charge: 0 };
  if (charged) {
    const [{ rates }, slots] = await Promise.all([getBilling(), packageSlots(ctx, s.patient_id)]);
    const priced = priceVisit({
      rates,
      slots,
      patientId: s.patient_id,
      date: s.session_date,
      status: s.status,
      visitTypeId: s.visit_type_id,
      chargeIt: true,
    });
    if ("error" in priced) throw new Error(priced.error);
    update = priced;
  }
  const { error } = await supabase.from("sessions").update(update).eq("id", sessionId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteSession(sessionId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  refresh();
}

/**
 * Many past visits at once (moving from paper records, or catching up). Days
 * that already have a visit are skipped. Visits are priced in date order, each
 * with the fee in force on its own day. Absences are recorded without a charge.
 */
async function insertPastSessions(
  ctx: Ctx,
  patientId: string,
  attended: string[],
  missed: string[],
  visitTypeId: string | null,
): Promise<{ added: number; skipped: number } | { error: string }> {
  const { supabase, clinic } = ctx;
  const all = [...attended.map((d) => [d, "attended"] as const), ...missed.map((d) => [d, "missed"] as const)].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const [{ rates }, slots, { data: existing }] = await Promise.all([
    getBilling(),
    packageSlots(ctx, patientId),
    supabase.from("sessions").select("session_date").eq("patient_id", patientId).in("session_date", all.map(([d]) => d)),
  ]);
  const taken = new Set((existing ?? []).map((s) => s.session_date as string));

  const rows = [];
  for (const [date, status] of all) {
    if (taken.has(date)) continue;
    const priced = priceVisit({ rates, slots, patientId, date, status, visitTypeId, chargeIt: false });
    if ("error" in priced) return priced;
    rows.push({ clinic_id: clinic.id, patient_id: patientId, session_date: date, status, visit_type_id: visitTypeId, ...priced });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("sessions").insert(rows);
    if (error) return { error: dbError(error) };
  }
  return { added: rows.length, skipped: all.length - rows.length };
}

export async function addPastSessions(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const past = pastDatesFrom(form, todayIn(ctx.clinic.timezone));
  if ("error" in past) return past;
  if (past.attended.length + past.missed.length === 0) return { error: "Tap the dates on the calendar first." };

  const result = await insertPastSessions(ctx, patientId, past.attended, past.missed, await visitTypeFrom(form));
  if ("error" in result) return result;
  const n = result.added;
  backToPatient(patientId, "visits", `${n} session${n === 1 ? "" : "s"} added${result.skipped ? ` (${result.skipped} already recorded)` : ""}`);
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
  if (scheduled < today) return { error: "That date has passed — use “Add past sessions” instead." };
  if (bookedOn > today) return { error: "Booked-on date can't be in the future." };
  if (bookedOn > scheduled) return { error: "Booked-on date can't be after the session date." };

  const { error } = await supabase.from("appointments").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    scheduled_date: scheduled,
    booked_on: bookedOn,
    visit_type_id: await visitTypeFrom(form),
    note: text(form, "note") || null,
  });
  if (error) return { error: dbError(error) };
  backToPatient(patientId, "overview", "Session booked");
}

export async function cancelBooking(appointmentId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Packages, extra charges & payments
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
  if (Number.isNaN(usedBefore) || usedBefore < 0) return { error: "“Sessions already done” must be a whole number." };
  if (usedBefore > sessions) return { error: "More sessions done than the package has." };
  if (startDate > today) return { error: "Start date can't be in the future." };

  const { error } = await supabase.from("packages").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    title: text(form, "title") || `${sessions} sessions`,
    total_sessions: sessions,
    price,
    start_date: startDate,
    visit_type_id: await visitTypeFrom(form),
    sessions_used_before: usedBefore,
  });
  if (error) return { error: dbError(error) };
  backToPatient(patientId, "account", "Package added");
}

export async function deletePackage(packageId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("packages").delete().eq("id", packageId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function addCharge(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const description = text(form, "description");
  const amount = money(form, "amount");
  const isDiscount = text(form, "kind") === "discount";
  const date = isoDate(form, "charge_date") ?? today;
  if (!description) return { error: isDiscount ? "Say what the discount is for." : "Say what the charge is for." };
  if (!(amount > 0)) return { error: "Enter the amount." };
  if (date > today) return { error: "Date can't be in the future." };

  const { error } = await supabase.from("charges").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    charge_date: date,
    description,
    amount: isDiscount ? -amount : amount,
  });
  if (error) return { error: dbError(error) };
  backToPatient(patientId, "account", isDiscount ? "Discount added" : "Charge added");
}

export async function deleteCharge(chargeId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("charges").delete().eq("id", chargeId);
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
  if (error) return { error: dbError(error) };
  backToPatient(patientId, "account", "Payment recorded");
}

export async function deletePayment(paymentId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Fees (dated). Setting a fee adds a new entry from a date; older visits keep
// the amount they were charged.
// ---------------------------------------------------------------------------

async function saveRate(
  { supabase, clinic }: Ctx,
  r: { patient_id: string | null; kind: RateKind; visit_type_id: string | null; amount: number | null; effective_from: string },
): Promise<string | null> {
  // One entry per fee per day: replace any entry with the same start date.
  let del = supabase.from("rates").delete().eq("kind", r.kind).eq("effective_from", r.effective_from);
  del = r.patient_id ? del.eq("patient_id", r.patient_id) : del.is("patient_id", null);
  del = r.visit_type_id ? del.eq("visit_type_id", r.visit_type_id) : del.is("visit_type_id", null);
  const { error: delError } = await del;
  if (delError) return dbError(delError);
  const { error } = await supabase.from("rates").insert({ clinic_id: clinic.id, ...r });
  return error ? dbError(error) : null;
}

function feeFormInput(form: FormData, today: string) {
  const kind = text(form, "kind") as RateKind;
  const from = isoDate(form, "effective_from") ?? today;
  const standard = text(form, "use_standard") === "on";
  const amount = standard ? null : money(form, "amount");
  if (!RATE_KINDS.includes(kind)) return { error: "Unknown fee." };
  if (amount !== null && (Number.isNaN(amount) || amount < 0 || !text(form, "amount"))) return { error: "Enter the fee amount." };
  return { kind, from, amount };
}

export async function setClinicFee(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const input = feeFormInput(form, todayIn(ctx.clinic.timezone));
  if ("error" in input) return input;
  if (input.amount === null) return { error: "Enter the fee amount." };
  const visitTypeId = input.kind === "visit" ? await visitTypeFrom(form) : null;
  if (input.kind === "visit" && !visitTypeId) return { error: "Pick the visit type." };

  const err = await saveRate(ctx, { patient_id: null, kind: input.kind, visit_type_id: visitTypeId, amount: input.amount, effective_from: input.from });
  if (err) return { error: err };
  refresh();
  redirect(`/profile/fees?${new URLSearchParams({ done: "Fee saved" })}`);
}

export async function setPatientFee(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const input = feeFormInput(form, todayIn(ctx.clinic.timezone));
  if ("error" in input) return input;
  const visitTypeId = await visitTypeFrom(form);
  if (!visitTypeId) return { error: "Pick the visit type." };

  const err = await saveRate(ctx, { patient_id: patientId, kind: "visit", visit_type_id: visitTypeId, amount: input.amount, effective_from: input.from });
  if (err) return { error: err };
  backToPatient(patientId, "account", input.amount === null ? "Back to standard fee" : "Fee saved");
}

export async function deleteRate(rateId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("rates").delete().eq("id", rateId);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Visit types
// ---------------------------------------------------------------------------

export async function addVisitType(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const name = text(form, "name");
  if (!name) return { error: "Enter a name, e.g. Group session." };
  const { visitTypes } = await getBilling();
  const { error } = await supabase
    .from("visit_types")
    .insert({ clinic_id: clinic.id, name, sort: Math.max(0, ...visitTypes.map((t) => t.sort)) + 1 });
  if (error) return { error: error.code === "23505" ? "You already have a visit type with that name." : dbError(error) };
  refresh();
  redirect(`/profile/fees?${new URLSearchParams({ done: `${name} added` })}`);
}

export async function renameVisitType(typeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const name = text(form, "name");
  if (!name) return { error: "Name can't be empty." };
  const { error } = await supabase.from("visit_types").update({ name }).eq("id", typeId);
  if (error) return { error: error.code === "23505" ? "You already have a visit type with that name." : dbError(error) };
  refresh();
  return { ok: "Renamed" };
}

export async function setVisitTypeArchived(typeId: string, archived: boolean) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("visit_types").update({ archived }).eq("id", typeId);
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
