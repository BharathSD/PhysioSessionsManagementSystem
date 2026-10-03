// Treatment-plan maths. All dates are "YYYY-MM-DD" calendar days, handled in
// UTC so no timezone can shift them by a day.

export type Plan = {
  id: string;
  patient_id: string;
  mode: "fixed_days" | "flexible";
  weekdays: number[]; // ISO: 1 = Mon … 7 = Sun
  every_n_weeks: number;
  sessions_per_period: number | null;
  valid_from: string;
  valid_until: string | null;
  note: string | null;
  visit_type_id: string | null;
  day_visit_types: Record<string, string>; // ISO weekday → visit type, for mixed schedules
};

export const WEEKDAYS = [
  { n: 1, short: "Mon" },
  { n: 2, short: "Tue" },
  { n: 3, short: "Wed" },
  { n: 4, short: "Thu" },
  { n: 5, short: "Fri" },
  { n: 6, short: "Sat" },
  { n: 7, short: "Sun" },
];

const DAY_MS = 86_400_000;

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS);
}

export function isoWeekday(date: string): number {
  return ((new Date(toMs(date)).getUTCDay() + 6) % 7) + 1;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

function weeksBetween(from: string, to: string): number {
  return Math.round((toMs(mondayOf(to)) - toMs(mondayOf(from))) / (7 * DAY_MS));
}

export function isActiveOn(plan: Plan, date: string): boolean {
  return plan.valid_from <= date && (plan.valid_until === null || plan.valid_until >= date);
}

/** The plan in force on a date (plans for one patient never overlap). */
export function planOn(plans: Plan[], date: string): Plan | undefined {
  return plans.find((p) => isActiveOn(p, date));
}

/** Is this a scheduled day for a fixed-days plan? */
export function isScheduledDay(plan: Plan, date: string): boolean {
  if (plan.mode !== "fixed_days" || !isActiveOn(plan, date)) return false;
  if (!plan.weekdays.includes(isoWeekday(date))) return false;
  return weeksBetween(plan.valid_from, date) % plan.every_n_weeks === 0;
}

/** The N-week block (Mon–Sun) containing `date`, counted from the plan's start week. */
export function periodOf(plan: Plan, date: string): { start: string; end: string } {
  const n = plan.every_n_weeks;
  const blocks = Math.floor(weeksBetween(plan.valid_from, date) / n);
  const start = addDays(mondayOf(plan.valid_from), blocks * n * 7);
  return { start, end: addDays(start, n * 7 - 1) };
}

/** For flexible plans: how many of this period's sessions are done. */
export function flexibleProgress(plan: Plan, date: string, attendedDates: string[]) {
  const { start, end } = periodOf(plan, date);
  const done = attendedDates.filter((d) => d >= start && d <= end && d >= plan.valid_from).length;
  const target = plan.sessions_per_period ?? 0;
  return { done, target, start, end };
}

/** Next scheduled day strictly after `after` (fixed-days plans only). */
export function nextScheduledDay(plan: Plan, after: string): string | null {
  if (plan.mode !== "fixed_days") return null;
  for (let i = 1; i <= 7 * plan.every_n_weeks + 7; i++) {
    const d = addDays(after, i);
    if (plan.valid_until && d > plan.valid_until) return null;
    if (isScheduledDay(plan, d)) return d;
  }
  return null;
}

/**
 * Roughly when the remaining paid sessions run out if the patient keeps to the
 * plan. `todayPending` = today is a session day not yet marked.
 */
export function projectedEnd(
  plan: Plan,
  today: string,
  sessionsLeft: number,
  attendedDates: string[],
): { date: string; approximate: boolean } | null {
  if (sessionsLeft <= 0) return null;

  if (plan.mode === "fixed_days") {
    let remaining = sessionsLeft;
    let d = isScheduledDay(plan, today) && !attendedDates.includes(today) ? today : nextScheduledDay(plan, today);
    while (d) {
      if (--remaining === 0) return { date: d, approximate: false };
      d = nextScheduledDay(plan, d);
    }
    return null;
  }

  const { done, target, end } = flexibleProgress(plan, today, attendedDates);
  if (!target) return null;
  const capacityNow = Math.max(0, target - done);
  if (sessionsLeft <= capacityNow) return { date: end, approximate: true };
  const morePeriods = Math.ceil((sessionsLeft - capacityNow) / target);
  return { date: addDays(end, morePeriods * plan.every_n_weeks * 7), approximate: true };
}

export function describePlan(plan: Plan): string {
  const every = plan.every_n_weeks === 1 ? "every week" : `every ${plan.every_n_weeks} weeks`;
  if (plan.mode === "fixed_days") {
    const days = WEEKDAYS.filter((w) => plan.weekdays.includes(w.n)).map((w) => w.short);
    return `${days.join(", ")} · ${every}`;
  }
  const k = plan.sessions_per_period ?? 0;
  const per = plan.every_n_weeks === 1 ? "a week" : `every ${plan.every_n_weeks} weeks`;
  return `${k}× ${per}, any day${k === 1 ? "" : "s"}`;
}

/** Next expected visit after `after`: the earlier of the plan's next day and any booking. */
export function nextVisit(plan: Plan | undefined, bookedDates: string[], after: string): string | null {
  const candidates = [
    ...(plan ? [nextScheduledDay(plan, after)] : []),
    ...bookedDates.filter((d) => d > after),
  ].filter((d): d is string => Boolean(d));
  return candidates.sort()[0] ?? null;
}

/** Visit type for a day under this plan (a per-weekday override, else the plan's type). */
export function planVisitType(plan: Plan, date: string): string | null {
  return plan.day_visit_types?.[String(isoWeekday(date))] ?? plan.visit_type_id;
}
