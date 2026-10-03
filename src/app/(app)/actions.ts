"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { patientFee, priceVisit, standardFee, type VisitOutcome } from "@/lib/fees";
import { formatDay, todayIn } from "@/lib/format";
import { isCountryCode, toE164 } from "@/lib/phone";
import { isDesignation, isPatientTitle, splitDesignation } from "@/lib/names";
import { dobForAge } from "@/lib/overview";
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

/** Optional personal details from PatientDetailsFields. */
/** Name and title; "Mrs. Lakshmi" typed into the name box works too. */
function patientNameFrom(form: FormData) {
  const typed = splitDesignation(text(form, "name"));
  const picked = text(form, "title");
  if (!typed.name) return { error: "Please enter the patient's name." };
  if (!isPatientTitle(picked)) return { error: "Pick a title." };
  return { name: typed.name, title: picked || typed.designation };
}

function personalFrom(form: FormData, today: string, clinicCountry: string) {
  const dob = isoDate(form, "date_of_birth");
  const age = text(form, "age") ? int(form, "age") : null;
  if (dob && dob > today) return { error: "Date of birth can't be in the future." };
  if (age !== null && (Number.isNaN(age) || age < 0 || age > 120)) return { error: "Age must be a number between 0 and 120." };

  const rawEmergency = text(form, "emergency_phone");
  const emergencyPhone = rawEmergency ? toE164(rawEmergency, text(form, "emergency_phone_country") || clinicCountry) : null;
  if (rawEmergency && !emergencyPhone) return { error: "The emergency contact number doesn't look right." };

  const injury = isoDate(form, "injury_date");
  if (injury && injury > today) return { error: "The injury / surgery date can't be in the future." };

  const gender = text(form, "gender");
  return {
    referred_by: text(form, "referred_by") || null,
    injury_date: injury,
    goals: text(form, "goals") || null,
    precautions: text(form, "precautions") || null,
    date_of_birth: dob ?? (age !== null ? dobForAge(age, today) : null),
    dob_is_estimate: !dob && age !== null,
    gender: ["female", "male", "other"].includes(gender) ? gender : null,
    address: text(form, "address") || null,
    emergency_name: text(form, "emergency_name") || null,
    emergency_phone: emergencyPhone,
  };
}

/** Optional 0–10 pain score: null = not recorded, undefined = invalid. */
function painFrom(form: FormData): number | null | undefined {
  const raw = text(form, "pain_score");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined;
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

/**
 * Fees typed for each visit type (fee_<visit type id>). An empty box, or the
 * same amount as the clinic standard on that date, means "use the standard fee".
 * Returns the fee rows to save for the patient (only real changes).
 */
async function patientFeeChanges(form: FormData, patientId: string | null, from: string) {
  const { activeTypes, rates } = await getBilling();
  const changes: { visit_type_id: string; amount: number | null }[] = [];
  for (const t of activeTypes) {
    const raw = text(form, `fee_${t.id}`).replace(/[,₹\s]/g, "");
    const typed = raw === "" ? null : Number(raw);
    if (typed !== null && (Number.isNaN(typed) || typed < 0)) return { error: `${t.name}: the fee must be a number.` };

    const std = standardFee(rates, "visit", t.id, from);
    const wanted: number | "standard" = typed === null || typed === std ? "standard" : typed;
    const current = patientId ? patientFee(rates, patientId, "visit", t.id, from) : undefined;
    const currentlyCustom = typeof current === "number";

    if (wanted === "standard") {
      if (currentlyCustom) changes.push({ visit_type_id: t.id, amount: null }); // back to the standard fee
    } else if (current !== wanted) {
      changes.push({ visit_type_id: t.id, amount: wanted });
    }
  }
  return changes;
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

type PatientTab = "overview" | "history" | "visits" | "account" | "schedule";

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

  const named = patientNameFrom(form);
  if ("error" in named) return named;
  const { name, title } = named;

  const phone = phoneFrom(form, clinic.country);
  if (phone === null) return { error: "That phone number doesn't look right for the selected country." };

  const personal = personalFrom(form, today, clinic.country);
  if ("error" in personal) return personal;

  const visitType = await visitTypeFrom(form);
  const sessions = text(form, "sessions") ? int(form, "sessions") : 0;
  const price = money(form, "price");
  const usedBefore = text(form, "used_before") ? int(form, "used_before") : 0;
  if (Number.isNaN(sessions) || sessions < 0) return { error: "Number of sessions must be a whole number." };
  if (Number.isNaN(usedBefore) || usedBefore < 0) return { error: "“Sessions already done” must be a whole number." };
  if (usedBefore > 0 && sessions === 0) return { error: "Add the package these sessions belong to." };
  if (Number.isNaN(price) || price < 0) return { error: "Package price must be a number." };
  const packageStart = isoDate(form, "package_start") ?? today;
  if (packageStart > today) return { error: "Package start date can't be in the future." };

  const payments = paymentsFrom(form, today);
  if ("error" in payments) return payments;

  const past = pastDatesFrom(form, today);
  if ("error" in past) return past;

  const plan = await planFrom(form, today);
  if (plan && "error" in plan) return plan;

  // The patient's own fees apply from the earliest date we have for them, so old visits use them too.
  const feesFrom = [today, packageStart, ...past.attended, ...past.missed].sort()[0];
  const fees = await patientFeeChanges(form, null, feesFrom);
  if ("error" in fees) return fees;

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinic.id,
      name,
      title,
      phone: phone ?? null,
      condition: text(form, "condition") || null,
      default_visit_type_id: visitType,
      ...personal,
    })
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

  if (fees.length > 0) {
    const { error: feeError } = await supabase
      .from("rates")
      .insert(fees.map((f) => ({ clinic_id: clinic.id, patient_id: patient.id, kind: "visit", effective_from: feesFrom, ...f })));
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
  const named = patientNameFrom(form);
  if ("error" in named) return named;
  const { name, title } = named;
  const phone = phoneFrom(form, clinic.country);
  if (phone === null) return { error: "That phone number doesn't look right for the selected country." };
  const personal = personalFrom(form, todayIn(clinic.timezone), clinic.country);
  if ("error" in personal) return personal;

  const { error } = await supabase
    .from("patients")
    .update({
      name,
      title,
      phone: phone ?? null,
      condition: text(form, "condition") || null,
      default_visit_type_id: await visitTypeFrom(form),
      ...personal,
    })
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

/** The patient's most recent active case that had opened by this date (visits are filed under it). */
async function activeCaseFor({ supabase }: Ctx, patientId: string, date: string): Promise<string | null> {
  const { data } = await supabase
    .from("cases")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "active")
    .lte("opened_on", date)
    .order("opened_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

type VisitInput = {
  date: string;
  status: VisitOutcome;
  visitTypeId: string | null;
  chargeIt: boolean;
  notes: string | null;
  pain?: number | null;
};

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
  const caseId = await activeCaseFor(ctx, patientId, v.date);
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
      case_id: caseId,
      notes: v.notes,
      pain_score: v.status === "attended" ? (v.pain ?? null) : null,
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

  const pain = painFrom(form);
  if (pain === undefined) return { error: "Pain score must be between 0 and 10." };

  const visitTypeId = await visitTypeFrom(form);
  const result = await recordVisit(ctx, patientId, {
    date,
    status,
    visitTypeId,
    chargeIt: status !== "attended" && text(form, "charge") === "on",
    notes: text(form, "notes") || null,
    pain,
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

/** Edit a recorded visit: date, outcome, visit type, price and notes. */
export async function updateSession(sessionId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const { supabase } = ctx;
  const today = todayIn(ctx.clinic.timezone);
  const { data: s } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  if (!s) return { error: "This visit no longer exists." };

  const date = isoDate(form, "session_date");
  const status = text(form, "status") as VisitOutcome;
  const billing = text(form, "billing");
  if (!date) return { error: "Pick the date." };
  if (date > today) return { error: "The date can't be in the future." };
  if (!STATUSES.includes(status)) return { error: "Pick what happened." };
  const pain = painFrom(form);
  if (pain === undefined) return { error: "Pain score must be between 0 and 10." };

  if (date !== s.session_date) {
    const { data: clash } = await supabase.from("sessions").select("id").eq("patient_id", s.patient_id).eq("session_date", date).neq("id", sessionId).maybeSingle();
    if (clash) return { error: "There's already a visit on that date. Edit or remove that one instead." };
  }

  let price = { package_id: null as string | null, charge: 0 };
  if (status === "cancelled_clinic" || billing === "none") {
    // no charge
  } else if (billing === "package") {
    if (s.package_id) {
      price = { package_id: s.package_id, charge: 0 };
    } else {
      const visitTypeId = await visitTypeFrom(form);
      const slot = (await packageSlots(ctx, s.patient_id))
        .filter((p) => p.remaining > 0 && (p.visit_type_id === null || p.visit_type_id === visitTypeId))
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      if (!slot) return { error: "No package sessions left for this visit type. Choose an amount instead." };
      price = { package_id: slot.id, charge: 0 };
    }
  } else if (billing === "amount") {
    const amount = money(form, "charge");
    if (Number.isNaN(amount) || amount < 0) return { error: "Enter the amount charged." };
    price = { package_id: null, charge: amount };
  } else {
    return { error: "Choose how this visit is paid for." };
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      session_date: date,
      status,
      visit_type_id: await visitTypeFrom(form),
      notes: text(form, "notes") || null,
      pain_score: status === "attended" ? pain : null,
      ...price,
    })
    .eq("id", sessionId);
  if (error) return { error: dbError(error) };
  backToPatient(s.patient_id, "visits", "Visit updated");
}

/** One-tap pain score after marking Present (the tapped button carries the score). */
export async function setPainScore(sessionId: string, form: FormData) {
  const pain = painFrom(form);
  if (pain === undefined) throw new Error("Pain score must be between 0 and 10.");
  const { supabase } = await getContext();
  const { error } = await supabase.from("sessions").update({ pain_score: pain }).eq("id", sessionId).eq("status", "attended");
  if (error) throw new Error(dbError(error));
  refresh();
}

/** Remove a visit from its edit screen and go back to the patient's visits. */
export async function removeVisit(sessionId: string, patientId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  backToPatient(patientId, "visits", "Visit removed");
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
type Pricing = { mode: "auto" } | { mode: "fixed"; amount: number } | { mode: "none" };

async function insertPastSessions(
  ctx: Ctx,
  patientId: string,
  attended: string[],
  missed: string[],
  visitTypeId: string | null,
  pricing: Pricing = { mode: "auto" },
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
    const priced =
      pricing.mode === "auto"
        ? priceVisit({ rates, slots, patientId, date, status, visitTypeId, chargeIt: false })
        : { package_id: null, charge: pricing.mode === "fixed" && status === "attended" ? pricing.amount : 0 };
    if ("error" in priced) return priced;
    rows.push({
      clinic_id: clinic.id,
      patient_id: patientId,
      session_date: date,
      status,
      visit_type_id: visitTypeId,
      case_id: await activeCaseFor(ctx, patientId, date),
      ...priced,
    });
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

  const mode = text(form, "pricing");
  let pricing: Pricing = { mode: "auto" };
  if (mode === "none") pricing = { mode: "none" };
  if (mode === "fixed") {
    const amount = money(form, "fixed_amount");
    if (!(amount > 0)) return { error: "Enter the amount per session, or choose another pricing option." };
    pricing = { mode: "fixed", amount };
  }

  const result = await insertPastSessions(ctx, patientId, past.attended, past.missed, await visitTypeFrom(form), pricing);
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

/** Save a patient's fees for every visit type at once, from one date. */
export async function setPatientFees(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getContext();
  const from = isoDate(form, "effective_from") ?? todayIn(ctx.clinic.timezone);
  const changes = await patientFeeChanges(form, patientId, from);
  if ("error" in changes) return changes;
  if (changes.length === 0) return { error: "Nothing changed — edit a fee first." };

  for (const c of changes) {
    const err = await saveRate(ctx, { patient_id: patientId, kind: "visit", effective_from: from, ...c });
    if (err) return { error: err };
  }
  backToPatient(patientId, "overview", `Fees saved (${changes.length} changed)`);
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
// Days off, cancelled in advance
// ---------------------------------------------------------------------------

/** Clinic closed / physio away for a date range. Then go straight to telling patients. */
export async function addClinicDaysOff(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const from = isoDate(form, "from_date");
  const to = isoDate(form, "to_date") ?? from;
  if (!from || !to) return { error: "Pick the first and last day." };
  if (to < from) return { error: "The last day can't be before the first day." };
  if (to < today) return { error: "Those days have already passed." };

  const { data, error } = await supabase
    .from("days_off")
    .insert({ clinic_id: clinic.id, patient_id: null, from_date: from, to_date: to, cancelled_by: "clinic", reason: text(form, "reason") || null })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  refresh();
  redirect(`/profile/days-off/${data.id}/notify`);
}

export async function removeDayOff(dayOffId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("days_off").delete().eq("id", dayOffId);
  if (error) throw new Error(error.message);
  refresh();
}

/** Tick a patient as told about a clinic closure (called when their WhatsApp opens). */
export async function markNotified(dayOffId: string, patientId: string) {
  const { supabase, clinic } = await getContext();
  await supabase.from("day_off_notices").upsert({ day_off_id: dayOffId, patient_id: patientId, clinic_id: clinic.id });
  revalidatePath(`/profile/days-off/${dayOffId}/notify`);
}

/**
 * One patient can't come: picked days (`dates`) or a break (`from_date`–`to_date`).
 * A single day can be rescheduled to a new date in the same step.
 */
export async function cancelPatientDays(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const by = text(form, "cancelled_by") === "clinic" ? "clinic" : "patient";
  const reason = text(form, "reason") || null;

  const picked = [...new Set(form.getAll("dates").map(String))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const from = isoDate(form, "from_date");
  const to = isoDate(form, "to_date") ?? from;
  const ranges: { from: string; to: string }[] = picked.length ? picked.map((d) => ({ from: d, to: d })) : from && to ? [{ from, to }] : [];
  if (ranges.length === 0) return { error: "Pick the days to cancel." };
  if (ranges.some((r) => r.to < r.from)) return { error: "The last day can't be before the first day." };
  if (ranges.some((r) => r.from < today)) return { error: "Only today or later can be cancelled in advance. Past days are marked from the calendar." };

  // Days already marked are edited, not cancelled in advance.
  const { data: marked } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("patient_id", patientId)
    .gte("session_date", ranges[0].from)
    .lte("session_date", ranges.at(-1)!.to);
  const clash = (marked ?? []).find((m) => ranges.some((r) => m.session_date >= r.from && m.session_date <= r.to));
  if (clash) return { error: `${clash.session_date} is already marked — edit that visit from the calendar instead.` };

  const { error } = await supabase
    .from("days_off")
    .insert(ranges.map((r) => ({ clinic_id: clinic.id, patient_id: patientId, from_date: r.from, to_date: r.to, cancelled_by: by, reason })));
  if (error) return { error: dbError(error) };

  const reschedule = ranges.length === 1 && ranges[0].from === ranges[0].to ? isoDate(form, "reschedule_date") : null;
  if (reschedule) {
    if (reschedule <= today) return { error: "Pick a new date after today." };
    const { error: e } = await supabase.from("appointments").insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      scheduled_date: reschedule,
      booked_on: today,
      visit_type_id: await visitTypeFrom(form),
      note: `Make-up for ${formatDay(ranges[0].from)}`,
    });
    if (e) return { error: dbError(e) };
  }

  refresh();
  const days = ranges.reduce((n, r) => n + Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1, 0);
  const qs = new URLSearchParams({
    done: `${days} day${days === 1 ? "" : "s"} cancelled${reschedule ? " · make-up booked" : ""}`,
    notify: ranges.map((r) => (r.from === r.to ? r.from : `${r.from}~${r.to}`)).join(","),
    by,
    ...(reschedule ? { makeup: reschedule } : {}),
  });
  redirect(`/patients/${patientId}?${qs}`);
}

/** Undo a patient's day off (the scheduled visits come back). */
export async function restorePatientDay(dayOffId: string, patientId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("days_off").delete().eq("id", dayOffId).eq("patient_id", patientId);
  if (error) throw new Error(error.message);
  backToPatient(patientId, "overview", "Day restored");
}

// ---------------------------------------------------------------------------
// Case history
// ---------------------------------------------------------------------------

const CASE_TEXT = ["chief_complaint", "history", "medical_history", "findings", "diagnosis", "goals", "plan"] as const;

function caseTextFrom(form: FormData) {
  return Object.fromEntries(CASE_TEXT.map((k) => [k, text(form, k) || null])) as Record<(typeof CASE_TEXT)[number], string | null>;
}

/** Open a case with its initial assessment. Earlier visits since the opening date are filed under it. */
export async function openCase(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const title = text(form, "title");
  const openedOn = isoDate(form, "opened_on") ?? today;
  if (!title) return { error: "Give the case a short title, e.g. “Right knee — ACL reconstruction”." };
  if (openedOn > today) return { error: "The case can't start in the future." };

  const { data, error } = await supabase
    .from("cases")
    .insert({ clinic_id: clinic.id, patient_id: patientId, title, opened_on: openedOn, ...caseTextFrom(form) })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  await supabase.from("sessions").update({ case_id: data.id }).eq("patient_id", patientId).is("case_id", null).gte("session_date", openedOn);

  refresh();
  const next = text(form, "then") === "pain" ? `/patients/${patientId}/pain/new?case=${data.id}&kind=initial` : `/patients/${patientId}/cases/${data.id}`;
  redirect(`${next}${next.includes("?") ? "&" : "?"}${new URLSearchParams({ done: "Case opened" })}`);
}

export async function updateCase(caseId: string, patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const title = text(form, "title");
  if (!title) return { error: "The case needs a title." };
  const openedOn = isoDate(form, "opened_on");
  const { error } = await supabase
    .from("cases")
    .update({ title, ...(openedOn ? { opened_on: openedOn } : {}), ...caseTextFrom(form) })
    .eq("id", caseId);
  if (error) return { error: dbError(error) };
  refresh();
  redirect(`/patients/${patientId}/cases/${caseId}?${new URLSearchParams({ done: "Assessment saved" })}`);
}

export async function dischargeCase(caseId: string, patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const closedOn = isoDate(form, "closed_on") ?? todayIn(clinic.timezone);
  const { data: c } = await supabase.from("cases").select("opened_on").eq("id", caseId).single();
  if (c && closedOn < c.opened_on) return { error: "Discharge can't be before the case opened." };
  const { error } = await supabase
    .from("cases")
    .update({ status: "discharged", closed_on: closedOn, discharge_summary: text(form, "discharge_summary") || null })
    .eq("id", caseId);
  if (error) return { error: dbError(error) };
  refresh();
  redirect(`/patients/${patientId}/cases/${caseId}?${new URLSearchParams({ done: "Patient discharged" })}`);
}

export async function reopenCase(caseId: string, patientId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("cases").update({ status: "active", closed_on: null }).eq("id", caseId);
  if (error) throw new Error(error.message);
  refresh();
  redirect(`/patients/${patientId}/cases/${caseId}?${new URLSearchParams({ done: "Case reopened" })}`);
}

const PAIN_LISTS = ["locations", "radiating", "character", "worse_times", "aggravating", "easing", "nerve_symptoms", "red_flags"] as const;
const PAIN_SCORES = ["at_rest", "on_activity", "at_night", "worst_24h", "best_24h", "before_session", "after_session"] as const;

/** Reads a pain assessment form. Returns null if nothing at all was recorded. */
function painAssessmentFrom(form: FormData) {
  const scores: Record<string, number | null> = {};
  for (const k of PAIN_SCORES) {
    const raw = text(form, k);
    const n = raw === "" ? null : Number(raw);
    if (n !== null && !(Number.isInteger(n) && n >= 0 && n <= 10)) return { error: "Pain scores must be between 0 and 10." };
    scores[k] = n;
  }
  const lists = Object.fromEntries(PAIN_LISTS.map((k) => [k, [...new Set(form.getAll(k).map(String).filter(Boolean))]])) as Record<
    (typeof PAIN_LISTS)[number],
    string[]
  >;
  const names = form.getAll("activity_name").map(String);
  const values = form.getAll("activity_score").map(String);
  const activities = names
    .map((name, i) => ({ name: name.trim(), score: values[i] === "" ? NaN : Number(values[i]) }))
    .filter((a) => a.name && Number.isInteger(a.score) && a.score >= 0 && a.score <= 10);
  const stiffness = text(form, "morning_stiffness_min") ? int(form, "morning_stiffness_min") : null;
  const pattern = text(form, "pattern");
  const onset = text(form, "onset");
  const fields = {
    ...scores,
    ...lists,
    activities,
    morning_stiffness_min: stiffness !== null && stiffness >= 0 ? stiffness : null,
    pattern: pattern === "constant" || pattern === "intermittent" ? pattern : null,
    onset: onset === "sudden" || onset === "gradual" ? onset : null,
    notes: text(form, "pain_notes") || null,
  };
  const empty =
    Object.values(scores).every((v) => v === null) &&
    Object.values(lists).every((v) => v.length === 0) &&
    activities.length === 0 &&
    !fields.pattern &&
    !fields.onset &&
    fields.morning_stiffness_min === null &&
    !fields.notes;
  return empty ? null : fields;
}

/** A full pain assessment (initial, reassessment or at discharge). Each one is kept as history. */
export async function savePainAssessment(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const assessed = isoDate(form, "assessed_on") ?? today;
  if (assessed > today) return { error: "The assessment date can't be in the future." };
  const kind = text(form, "kind");
  if (!["initial", "reassessment", "discharge", "session"].includes(kind)) return { error: "Unknown assessment type." };
  const fields = painAssessmentFrom(form);
  if (fields && "error" in fields) return fields;
  if (!fields) return { error: "Nothing recorded yet — add at least a score, a location or a note." };
  const caseId = text(form, "case_id") || null;

  const { error } = await supabase
    .from("pain_assessments")
    .insert({ clinic_id: clinic.id, patient_id: patientId, case_id: caseId, assessed_on: assessed, kind, ...fields });
  if (error) return { error: dbError(error) };
  refresh();
  redirect(
    caseId
      ? `/patients/${patientId}/cases/${caseId}?${new URLSearchParams({ done: "Pain assessment saved" })}`
      : `/patients/${patientId}?${new URLSearchParams({ tab: "history", done: "Pain assessment saved" })}`,
  );
}

export async function deletePainAssessment(id: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("pain_assessments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function addMeasurement(patientId: string, caseId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const name = text(form, "name");
  const value = Number(text(form, "value").replace(",", "."));
  const on = isoDate(form, "measured_on") ?? today;
  if (!name) return { error: "What was measured? e.g. “Knee flexion (R)”." };
  if (text(form, "value") === "" || Number.isNaN(value)) return { error: "Enter the measured value as a number." };
  if (on > today) return { error: "The date can't be in the future." };
  const { error } = await supabase.from("measurements").insert({
    clinic_id: clinic.id,
    patient_id: patientId,
    case_id: caseId,
    measured_on: on,
    name,
    value,
    unit: text(form, "unit") || null,
    notes: text(form, "notes") || null,
  });
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: `${name} saved` };
}

export async function deleteMeasurement(id: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

/**
 * What was done in a session: exercises and treatments (copied by name and
 * dosage), notes, the case it belongs to, and an optional quick pain check.
 * New names are added to the clinic's list automatically.
 */
export async function saveSessionRecord(sessionId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const { data: s } = await supabase.from("sessions").select("id, patient_id, session_date").eq("id", sessionId).single();
  if (!s) return { error: "This visit no longer exists." };

  const kinds = form.getAll("item_kind").map(String);
  const names = form.getAll("item_name").map((v) => String(v).trim());
  const dosages = form.getAll("item_dosage").map((v) => String(v).trim());
  const items = names
    .map((name, i) => ({ name, kind: kinds[i] === "treatment" ? "treatment" : "exercise", dosage: dosages[i] || null }))
    .filter((it) => it.name);

  // Make sure every item is on the clinic's list (new names are added).
  const { data: library } = await supabase.from("exercise_library").select("id, kind, name");
  const known = new Map((library ?? []).map((l) => [`${l.kind}:${l.name.toLowerCase()}`, l.id as string]));
  const missing = [...new Map(items.filter((it) => !known.has(`${it.kind}:${it.name.toLowerCase()}`)).map((it) => [`${it.kind}:${it.name.toLowerCase()}`, it])).values()];
  if (missing.length > 0) {
    const { data: added, error } = await supabase
      .from("exercise_library")
      .insert(missing.map((it) => ({ clinic_id: clinic.id, kind: it.kind, name: it.name, dosage: it.dosage })))
      .select("id, kind, name");
    if (error) return { error: dbError(error) };
    for (const l of added ?? []) known.set(`${l.kind}:${l.name.toLowerCase()}`, l.id);
  }

  const pain = painAssessmentFrom(form);
  if (pain && "error" in pain) return pain;

  const caseId = text(form, "case_id") || null;
  const { error: sessionError } = await supabase.from("sessions").update({ notes: text(form, "notes") || null, case_id: caseId }).eq("id", sessionId);
  if (sessionError) return { error: dbError(sessionError) };

  await supabase.from("session_items").delete().eq("session_id", sessionId);
  if (items.length > 0) {
    const { error } = await supabase.from("session_items").insert(
      items.map((it, i) => ({
        clinic_id: clinic.id,
        session_id: sessionId,
        item_id: known.get(`${it.kind}:${it.name.toLowerCase()}`) ?? null,
        kind: it.kind,
        name: it.name,
        dosage: it.dosage,
        sort: i,
      })),
    );
    if (error) return { error: dbError(error) };
  }

  if (pain) {
    const { error } = await supabase.from("pain_assessments").insert({
      clinic_id: clinic.id,
      patient_id: s.patient_id,
      case_id: caseId,
      session_id: sessionId,
      assessed_on: s.session_date,
      kind: "session",
      ...pain,
    });
    if (error) return { error: dbError(error) };
  }
  backToPatient(s.patient_id, "visits", "Session record saved");
}

export async function addLibraryItem(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic } = await getContext();
  const kind = text(form, "kind") === "treatment" ? "treatment" : "exercise";
  const name = text(form, "name");
  if (!name) return { error: "Enter a name." };
  const { error } = await supabase.from("exercise_library").insert({ clinic_id: clinic.id, kind, name, dosage: text(form, "dosage") || null });
  if (error) return { error: error.code === "23505" ? "That's already on your list." : dbError(error) };
  refresh();
  return { ok: `${name} added` };
}

export async function updateLibraryItem(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getContext();
  const name = text(form, "name");
  if (!name) return { error: "Name can't be empty." };
  const { error } = await supabase.from("exercise_library").update({ name, dosage: text(form, "dosage") || null }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That name is already on your list." : dbError(error) };
  refresh();
  return { ok: "Saved" };
}

export async function setLibraryItemArchived(id: string, archived: boolean) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("exercise_library").update({ archived }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic, member, userId } = await getContext();

  const typed = splitDesignation(text(form, "display_name"));
  const picked = text(form, "designation");
  if (!isDesignation(picked)) return { error: "Pick a title." };
  const clinicName = text(form, "clinic_name");
  if (!typed.name) return { error: "Your name is required." };

  const { error: memberError } = await supabase
    .from("clinic_members")
    .update({ display_name: typed.name, designation: picked || typed.designation })
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
