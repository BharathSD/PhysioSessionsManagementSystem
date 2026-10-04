// Who is expected on a given day and who has been marked — shared by the
// Today screen and the Home overview.

import type { getContext } from "./context";
import { toSummary } from "./data";
import { isOffFor, offOn, weeklyOff, type DayOff } from "./days-off";
import { getT } from "@/i18n/server";
import { addDays, describePlan, flexibleProgress, isScheduledDay, nextVisit, planVisitType, type Plan } from "./schedule";
import type { Appointment, PatientSummary, Session } from "./types";

type Ctx = Awaited<ReturnType<typeof getContext>>;

export type BoardRow = {
  p: PatientSummary;
  session?: Session;
  /** Why they're expected: a booking, a fixed day, or a flexible plan still short this week. */
  expected?: { kind: "booked" | "fixed" | "flexible"; label: string };
  next: string | null;
  /** Visit type for this day: the booking's, the schedule's for this weekday, or the patient's usual. */
  visitTypeId: string | null;
  /** Cancelled in advance for this day (clinic closed, or this patient's day off). */
  off?: DayOff;
};

/** `physioId`: only that physio's patients (the "My patients" filter in a clinic team). */
export async function getBoard({ supabase, clinic }: Ctx, date: string, search = "", physioId?: string) {
  let patientsQuery = supabase.from("patient_summary").select("*").eq("archived", false).order("name");
  if (search) patientsQuery = patientsQuery.ilike("name", `%${search}%`);
  if (physioId) patientsQuery = patientsQuery.eq("physio_id", physioId);

  const [{ data: rows, error }, { data: sessions }, { data: plans }, { data: bookings }, { data: recent }, { data: offs }] = await Promise.all([
    patientsQuery,
    supabase.from("sessions").select("*").eq("session_date", date).order("created_at"),
    supabase.from("schedules").select("*").lte("valid_from", date).or(`valid_until.is.null,valid_until.gte.${date}`),
    supabase.from("appointments").select("*").eq("status", "booked").gte("scheduled_date", date).order("scheduled_date"),
    // Enough history to count progress in flexible plans (periods up to 8 weeks).
    supabase.from("sessions").select("patient_id, session_date").eq("status", "attended").gte("session_date", addDays(date, -56)),
    // Days off from this date on (for today's list and for skipping them in "next visit").
    supabase.from("days_off").select("*").gte("to_date", date),
  ]);
  const daysOff = [...((offs ?? []) as DayOff[]), ...weeklyOff(clinic.closed_weekdays)];
  if (error) throw new Error(error.message);
  const t = await getT();

  const marked = new Map<string, Session>();
  for (const s of (sessions ?? []) as Session[]) marked.set(s.patient_id, s);
  const planOf = new Map(((plans ?? []) as Plan[]).map((pl) => [pl.patient_id, pl]));
  const bookingsOf = groupBy((bookings ?? []) as Appointment[], (b) => b.patient_id);
  const attendedOf = groupBy(recent ?? [], (s) => s.patient_id as string);

  const board: BoardRow[] = (rows ?? []).map((raw) => {
    const p = toSummary(raw);
    const plan = planOf.get(p.id);
    const booked = bookingsOf.get(p.id) ?? [];
    const bookedToday = booked.find((b) => b.scheduled_date === date);
    const isOff = isOffFor(daysOff, p.id);
    const row: BoardRow = {
      p,
      session: marked.get(p.id),
      next: nextVisit(plan, booked.map((b) => b.scheduled_date), date, isOff),
      visitTypeId: (plan && planVisitType(plan, date)) ?? p.default_visit_type_id,
      off: offOn(daysOff, p.id, date),
    };

    if (bookedToday) {
      row.visitTypeId = bookedToday.visit_type_id ?? row.visitTypeId;
      row.expected = { kind: "booked", label: t("Booked on {date}", { date: t.date(bookedToday.booked_on) }) };
    } else if (plan && isScheduledDay(plan, date)) {
      row.expected = { kind: "fixed", label: describePlan(plan, t) };
    } else if (plan?.mode === "flexible") {
      const dates = (attendedOf.get(p.id) ?? []).map((s) => s.session_date as string).filter((d) => d <= date);
      // Expected if still short *before* this day; the label counts this day's visit too.
      const before = flexibleProgress(plan, date, dates.filter((d) => d < date));
      if (before.done < before.target) {
        const { done, target } = flexibleProgress(plan, date, dates);
        row.expected = {
          kind: "flexible",
          label: plan.every_n_weeks === 1 ? t("{done} of {target} done this week", { done, target }) : t("{done} of {target} done this period", { done, target }),
        };
      }
    }
    return row;
  });

  // Not yet marked first, so each list shrinks as the day goes on.
  const byPending = (a: BoardRow, b: BoardRow) => Number(Boolean(a.session)) - Number(Boolean(b.session));
  // Would have come today but the day was cancelled in advance (unless they came anyway).
  const cancelledAhead = (r: BoardRow) => Boolean(r.expected && r.off && !r.session);
  const expected = board.filter((r) => r.expected && !cancelledAhead(r)).sort(byPending);
  const offToday = board.filter(cancelledAhead);
  // Everyone else stays available as a walk-in, even on a closed day.
  const others = board.filter((r) => !r.expected).sort(byPending);
  const clinicClosed = offOn(daysOff, null, date);
  const seen = [...marked.values()].filter((s) => s.status === "attended").length;

  return { expected, others, offToday, clinicClosed, seen, all: board, daysOff };
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
