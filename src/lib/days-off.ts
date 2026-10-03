// Days off cancelled in advance: the whole clinic (patient_id null) or one patient.

export type DayOff = {
  id: string;
  patient_id: string | null;
  from_date: string;
  to_date: string;
  cancelled_by: "clinic" | "patient";
  reason: string | null;
};

/** The day off covering this date for this patient (their own first, else a clinic closure). */
export function offOn(daysOff: DayOff[], patientId: string | null, date: string): DayOff | undefined {
  const covering = daysOff.filter((d) => d.from_date <= date && d.to_date >= date);
  return covering.find((d) => d.patient_id !== null && d.patient_id === patientId) ?? covering.find((d) => d.patient_id === null);
}

/** A quick "is this date off for this patient?" check for the schedule helpers. */
export function isOffFor(daysOff: DayOff[], patientId: string | null): (date: string) => boolean {
  return (date) => Boolean(offOn(daysOff, patientId, date));
}

/** "Clinic closed · Diwali" / "Cancelled by patient · travelling" */
export function describeOff(d: DayOff): string {
  const who = d.patient_id === null ? "Clinic closed" : d.cancelled_by === "patient" ? "Cancelled by patient" : "Cancelled by clinic";
  return d.reason ? `${who} · ${d.reason}` : who;
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(d);
  return out;
}
