// Who is expected on a given day and who has been marked — shared by the
// Today screen and the Home overview.

import type { getContext } from "./context";
import { toSummary } from "./data";
import { formatDate } from "./format";
import { addDays, describePlan, flexibleProgress, isScheduledDay, nextVisit, type Plan } from "./schedule";
import type { Appointment, PatientSummary, Session } from "./types";

type Ctx = Awaited<ReturnType<typeof getContext>>;

export type BoardRow = {
  p: PatientSummary;
  session?: Session;
  /** Why they're expected: a booking, a fixed day, or a flexible plan still short this week. */
  expected?: { kind: "booked" | "fixed" | "flexible"; label: string };
  next: string | null;
};

export async function getBoard({ supabase }: Ctx, date: string, search = "") {
  let patientsQuery = supabase.from("patient_summary").select("*").eq("archived", false).order("name");
  if (search) patientsQuery = patientsQuery.ilike("name", `%${search}%`);

  const [{ data: rows, error }, { data: sessions }, { data: plans }, { data: bookings }, { data: recent }] = await Promise.all([
    patientsQuery,
    supabase.from("sessions").select("*").eq("session_date", date).order("created_at"),
    supabase.from("schedules").select("*").lte("valid_from", date).or(`valid_until.is.null,valid_until.gte.${date}`),
    supabase.from("appointments").select("*").eq("status", "booked").gte("scheduled_date", date).order("scheduled_date"),
    // Enough history to count progress in flexible plans (periods up to 8 weeks).
    supabase.from("sessions").select("patient_id, session_date").eq("status", "attended").gte("session_date", addDays(date, -56)),
  ]);
  if (error) throw new Error(error.message);

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
    const row: BoardRow = { p, session: marked.get(p.id), next: nextVisit(plan, booked.map((b) => b.scheduled_date), date) };

    if (bookedToday) {
      row.expected = { kind: "booked", label: `Booked on ${formatDate(bookedToday.booked_on)}` };
    } else if (plan && isScheduledDay(plan, date)) {
      row.expected = { kind: "fixed", label: describePlan(plan) };
    } else if (plan?.mode === "flexible") {
      const dates = (attendedOf.get(p.id) ?? []).map((s) => s.session_date as string).filter((d) => d <= date);
      // Expected if still short *before* this day; the label counts this day's visit too.
      const before = flexibleProgress(plan, date, dates.filter((d) => d < date));
      if (before.done < before.target) {
        const { done, target } = flexibleProgress(plan, date, dates);
        const when = plan.every_n_weeks === 1 ? "this week" : "this period";
        row.expected = { kind: "flexible", label: `${done} of ${target} done ${when}` };
      }
    }
    return row;
  });

  // Not yet marked first, so each list shrinks as the day goes on.
  const byPending = (a: BoardRow, b: BoardRow) => Number(Boolean(a.session)) - Number(Boolean(b.session));
  const expected = board.filter((r) => r.expected).sort(byPending);
  const others = board.filter((r) => !r.expected).sort(byPending);
  const seen = [...marked.values()].filter((s) => s.status === "attended").length;

  return { expected, others, seen, all: board };
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
