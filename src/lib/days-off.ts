// Days off cancelled in advance: the whole clinic (patient_id null) or one patient.

import { EN, type T } from "@/i18n";

export type DayOff = {
  id: string;
  patient_id: string | null;
  from_date: string;
  to_date: string;
  cancelled_by: "clinic" | "patient";
  reason: string | null;
  /** Only on these ISO weekdays (1 = Mon … 7 = Sun): the clinic's weekly closing days. */
  weekdays?: number[];
};

const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/**
 * The clinic's weekly closing days (e.g. every Sunday) as one open-ended clinic
 * day off, to add to the days off loaded from the database.
 */
export function weeklyOff(closedWeekdays: number[] | null | undefined): DayOff[] {
  if (!closedWeekdays?.length) return [];
  return [{ id: "weekly", patient_id: null, from_date: "0001-01-01", to_date: "9999-12-31", cancelled_by: "clinic", reason: null, weekdays: closedWeekdays }];
}

/** The day off covering this date for this patient (their own first, else a clinic closure). */
export function offOn(daysOff: DayOff[], patientId: string | null, date: string): DayOff | undefined {
  const covering = daysOff.filter((d) => d.from_date <= date && d.to_date >= date && (!d.weekdays || d.weekdays.includes(isoWeekday(date))));
  return covering.find((d) => d.patient_id !== null && d.patient_id === patientId) ?? covering.find((d) => d.patient_id === null);
}

/** A quick "is this date off for this patient?" check for the schedule helpers. */
export function isOffFor(daysOff: DayOff[], patientId: string | null): (date: string) => boolean {
  return (date) => Boolean(offOn(daysOff, patientId, date));
}

/** "Clinic closed · Diwali" / "Cancelled by patient · travelling" */
export function describeOff(d: DayOff, t: T = EN): string {
  if (d.weekdays) return t("Clinic closed (weekly off)");
  const who = d.patient_id === null ? t("Clinic closed") : d.cancelled_by === "patient" ? t("Cancelled by patient") : t("Cancelled by clinic");
  return d.reason ? `${who} · ${d.reason}` : who;
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(d);
  return out;
}
