// Calculations for a patient's Overview tab. Plain functions over data already
// loaded for the patient page, so they're easy to test.

import { addDays, isActiveOn, isScheduledDay, mondayOf, planVisitType, type Plan } from "./schedule";
import type { Appointment, Charge, Package, Payment, Rate, Session } from "./types";

type Visit = Pick<Session, "id" | "session_date" | "status" | "visit_type_id" | "notes" | "charge" | "package_id">;

/** Outcomes in the last 30 days, and the share of sessions the patient turned up to. */
export function attendance(visits: Visit[], today: string) {
  const since = addDays(today, -29);
  const recent = visits.filter((v) => v.session_date >= since && v.session_date <= today);
  const present = recent.filter((v) => v.status === "attended").length;
  const absent = recent.filter((v) => v.status === "missed").length;
  const cancelled = recent.filter((v) => v.status === "cancelled_patient").length;
  const counted = present + absent + cancelled; // clinic cancellations aren't the patient's doing
  return { present, absent, cancelled, rate: counted ? Math.round((present / counted) * 100) : null };
}

/** Sessions per week the schedule asks for. */
export function plannedPerWeek(plan: Plan | undefined): number | null {
  if (!plan) return null;
  const perPeriod = plan.mode === "fixed_days" ? plan.weekdays.length : (plan.sessions_per_period ?? 0);
  return perPeriod / plan.every_n_weeks;
}

/** Visits per week actually attended over the last 4 weeks (or since the first visit, if sooner). */
export function actualPerWeek(visits: Visit[], today: string): number | null {
  const attended = visits.filter((v) => v.status === "attended" && v.session_date <= today).map((v) => v.session_date);
  if (attended.length === 0) return null;
  const first = attended.reduce((a, b) => (a < b ? a : b));
  const windowStart = [addDays(today, -27), first].sort().at(-1)!;
  const days = (Date.parse(today) - Date.parse(windowStart)) / 86_400_000 + 1;
  const count = attended.filter((d) => d >= windowStart).length;
  return count / Math.max(1, days / 7);
}

/** Visits attended in each of the last `weeks` weeks (Mon–Sun), oldest first. */
export function weeklyVisits(visits: Visit[], today: string, weeks = 8) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisMonday, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    return { start, count: visits.filter((v) => v.status === "attended" && v.session_date >= start && v.session_date <= end).length };
  });
}

/** How many of the most recent visits in a row were absences. */
export function absentStreak(visits: Visit[]): number {
  const sorted = [...visits].sort((a, b) => b.session_date.localeCompare(a.session_date));
  let n = 0;
  for (const v of sorted) {
    if (v.status === "cancelled_clinic") continue;
    if (v.status !== "missed") break;
    n += 1;
  }
  return n;
}

/**
 * Expected visits over the next `days` days: schedule days and bookings.
 * Includes today when `includeToday` (today's session hasn't been marked yet).
 */
export function upcomingVisits(
  plans: Plan[],
  bookings: Pick<Appointment, "scheduled_date" | "visit_type_id">[],
  defaultType: string | null,
  today: string,
  days = 7,
  includeToday = false,
) {
  const out: { date: string; visitTypeId: string | null; booked: boolean }[] = [];
  for (let i = includeToday ? 0 : 1; i <= days; i++) {
    const date = addDays(today, i);
    const booking = bookings.find((b) => b.scheduled_date === date);
    const plan = plans.find((p) => isActiveOn(p, date));
    if (booking) out.push({ date, visitTypeId: booking.visit_type_id ?? defaultType, booked: true });
    else if (plan && isScheduledDay(plan, date)) out.push({ date, visitTypeId: planVisitType(plan, date) ?? defaultType, booked: false });
  }
  return out;
}

/**
 * The date of the oldest charge that hasn't been paid off yet, treating
 * payments (and discounts) as paying the oldest charges first. Null if nothing is due.
 */
export function dueSince(input: { packages: Package[]; visits: Visit[]; charges: Charge[]; payments: Payment[] }): string | null {
  const debits = [
    ...input.packages.map((p) => ({ date: p.start_date, amount: Number(p.price) })),
    ...input.visits.filter((v) => Number(v.charge) > 0).map((v) => ({ date: v.session_date, amount: Number(v.charge) })),
    ...input.charges.filter((c) => Number(c.amount) > 0).map((c) => ({ date: c.charge_date, amount: Number(c.amount) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let credit =
    input.payments.reduce((s, p) => s + Number(p.amount), 0) +
    input.charges.filter((c) => Number(c.amount) < 0).reduce((s, c) => s - Number(c.amount), 0);
  for (const d of debits) {
    if (credit >= d.amount - 0.005) {
      credit -= d.amount;
    } else {
      return d.date;
    }
  }
  return null;
}

export type ActivityItem = { date: string; kind: "visit" | "payment" | "booking" | "schedule" | "fee" | "charge"; title: string; detail?: string };

/** The most recent things that happened for this patient, newest first. */
export function recentActivity(
  input: {
    visits: Visit[];
    payments: Payment[];
    bookings: Pick<Appointment, "booked_on" | "scheduled_date" | "status">[];
    plans: Plan[];
    rates: Rate[];
    charges: Charge[];
  },
  label: {
    visit: (v: Visit) => { title: string; detail?: string };
    payment: (p: Payment) => string;
    plan: (p: Plan) => string;
    fee: (r: Rate) => string;
    money: (n: number) => string;
    date: (d: string) => string;
  },
  limit = 6,
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...input.visits.map((v) => ({ date: v.session_date, kind: "visit" as const, ...label.visit(v) })),
    ...input.payments.map((p) => ({ date: p.paid_on, kind: "payment" as const, title: label.payment(p), detail: p.note ?? undefined })),
    ...input.bookings.map((b) => ({
      date: b.booked_on,
      kind: "booking" as const,
      title: `Booked a session for ${label.date(b.scheduled_date)}`,
      detail: b.status === "cancelled" ? "Booking cancelled" : undefined,
    })),
    ...input.plans.map((p) => ({ date: p.valid_from, kind: "schedule" as const, title: `Schedule: ${label.plan(p)}`, detail: p.note ?? undefined })),
    ...input.rates.map((r) => ({ date: r.effective_from, kind: "fee" as const, title: label.fee(r) })),
    ...input.charges.map((c) => ({
      date: c.charge_date,
      kind: "charge" as const,
      title: `${Number(c.amount) < 0 ? "Discount" : "Charge"}: ${c.description}`,
      detail: label.money(Math.abs(Number(c.amount))),
    })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Whole years between a date of birth and today. */
export function ageOn(dob: string, today: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** A date of birth that gives this age today (used when only the age is known). */
export function dobForAge(age: number, today: string): string {
  const [ty, tm, td] = today.split("-").map(Number);
  return `${String(ty - age).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(Math.min(td, 28)).padStart(2, "0")}`;
}
