import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkRow, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getBoard } from "@/lib/board";
import { getContext } from "@/lib/context";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { addDays, isActiveOn, isScheduledDay, type Plan } from "@/lib/schedule";

export const metadata = { title: "Home" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const ctx = await getContext();
  const { supabase, clinic, member } = ctx;
  const today = todayIn(clinic.timezone);
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekEnd = addDays(today, 7);

  const [{ rates }, board, yesterdayBoard, { count: monthSessions }, { data: monthPayments }, { data: plans }, { data: bookings }] = await Promise.all([
    getBilling(),
    getBoard(ctx, today),
    getBoard(ctx, yesterday),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("status", "attended").gte("session_date", monthStart),
    supabase.from("payments").select("amount").gte("paid_on", monthStart),
    supabase.from("schedules").select("*").eq("mode", "fixed_days").or(`valid_until.is.null,valid_until.gt.${today}`),
    supabase.from("appointments").select("patient_id, scheduled_date").eq("status", "booked").gt("scheduled_date", today).lte("scheduled_date", weekEnd),
  ]);

  const patients = board.all.map((r) => r.p);
  const owing = patients.filter((p) => p.amount_due > 0).sort((a, b) => b.amount_due - a.amount_due);
  const totalDue = owing.reduce((sum, p) => sum + p.amount_due, 0);
  const ending = patients.filter((p) => p.sessions_bought > 0 && p.sessions_left <= 1);
  const noFees = !rates.some((r) => r.patient_id === null && r.kind === "visit" && r.amount !== null);
  const unmarked = yesterdayBoard.expected.filter((r) => !r.session && r.expected?.kind !== "flexible");
  const collected = (monthPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const money = (n: number) => formatMoney(n, clinic.currency);

  // Next 7 days: how many patients are expected each day (fixed days + bookings).
  const active = new Set(patients.map((p) => p.id));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1);
    const ids = new Set<string>();
    for (const pl of (plans ?? []) as Plan[]) if (active.has(pl.patient_id) && isActiveOn(pl, day) && isScheduledDay(pl, day)) ids.add(pl.patient_id);
    for (const b of bookings ?? []) if (active.has(b.patient_id) && b.scheduled_date === day) ids.add(b.patient_id);
    return { day, count: ids.size };
  });
  const busiest = Math.max(1, ...week.map((d) => d.count));

  const expectedCount = board.expected.length;
  const expectedDone = board.expected.filter((r) => r.session).length;
  const progress = expectedCount ? Math.round((expectedDone / expectedCount) * 100) : 0;
  const firstName = member.display_name.replace(/^dr\.?\s+/i, "Dr. ").split(" ").slice(0, 2).join(" ");

  return (
    <div>
      <div className="mb-5">
        <p className="text-base text-muted">{formatDate(today)}</p>
        <h1 className="text-[1.65rem] leading-tight font-semibold">
          {greeting(clinic.timezone)}, {firstName}
        </h1>
      </div>

      {/* Today at a glance */}
      <Link href="/today" className="card block bg-brand text-brand-fg active:scale-[0.99]" style={{ borderColor: "transparent" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium opacity-80">Today</p>
            {expectedCount > 0 ? (
              <p className="text-2xl font-semibold">
                {expectedDone} of {expectedCount} marked
              </p>
            ) : (
              <p className="text-2xl font-semibold">No one scheduled</p>
            )}
            <p className="text-sm opacity-80">
              {board.seen} patient{board.seen === 1 ? "" : "s"} seen so far
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-brand-fg/15 px-3 py-2 text-sm font-medium">
            Open
            <Icon name="chevron" className="size-4" />
          </span>
        </div>
        {expectedCount > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-fg/20">
            <div className="h-full rounded-full bg-brand-fg" style={{ width: `${progress}%` }} />
          </div>
        )}
      </Link>

      {/* Needs attention */}
      <SectionTitle>Needs attention</SectionTitle>
      {owing.length + ending.length + unmarked.length + Number(noFees) === 0 ? (
        <div className="card flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ok-soft text-ok">
            <Icon name="check" />
          </span>
          <p className="font-medium">All caught up — nothing pending.</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {noFees && (
            <LinkRow
              href="/profile/fees"
              icon="rupee"
              tone="warn"
              title="Set your fees"
              detail="In-clinic, home visit and online fees — used when you mark attendance"
            />
          )}
          {unmarked.slice(0, 5).map((r) => (
            <LinkRow
              key={r.p.id}
              href={`/patients/${r.p.id}/past-sessions`}
              icon="alert"
              tone="warn"
              title={`${r.p.name} — not marked yesterday`}
              detail="Tap to mark present or absent"
            />
          ))}
          {owing.length > 0 && (
            <LinkRow
              href="/patients?filter=due"
              icon="rupee"
              tone="bad"
              title={`${money(totalDue)} due from ${owing.length} patient${owing.length === 1 ? "" : "s"}`}
              detail={owing
                .slice(0, 3)
                .map((p) => p.name)
                .join(", ")}
            />
          )}
          {ending.length > 0 && (
            <LinkRow
              href="/patients?filter=ending"
              icon="package"
              tone="warn"
              title={`${ending.length} package${ending.length === 1 ? "" : "s"} running out`}
              detail={`${ending
                .slice(0, 3)
                .map((p) => p.name)
                .join(", ")} — offer a renewal`}
            />
          )}
        </div>
      )}

      {/* Coming week */}
      <SectionTitle aside="Scheduled + booked">Next 7 days</SectionTitle>
      <div className="card">
        <div className="grid grid-cols-7 items-end gap-1.5 text-center">
          {week.map(({ day, count }) => (
            <div key={day} className="flex flex-col items-center gap-1">
              <span className="text-sm font-semibold">{count || "–"}</span>
              <div className="flex h-16 w-full items-end">
                <div className="w-full rounded-md bg-brand/80" style={{ height: `${count ? Math.max(12, (count / busiest) * 100) : 4}%`, opacity: count ? 1 : 0.25 }} />
              </div>
              <span className="text-xs text-muted">
                {new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}
              </span>
              <span className="text-[11px] text-muted">{+day.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* This month */}
      <SectionTitle>
        This month · {new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`))}
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-muted">Sessions done</p>
          <p className="text-3xl font-semibold">{monthSessions ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Money collected</p>
          <p className="text-3xl font-semibold">{money(collected)}</p>
        </div>
      </div>
      <p className="mt-2 px-1 text-sm text-muted">
        {patients.length} active patient{patients.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
