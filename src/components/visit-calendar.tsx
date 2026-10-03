"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, isActiveOn, isScheduledDay, planVisitType, type Plan } from "@/lib/schedule";
import type { SessionStatus } from "@/lib/types";

export type CalendarVisit = { id: string; date: string; status: SessionStatus; visitTypeId: string | null; pain: number | null };
export type CalendarBooking = { date: string; visitTypeId: string | null; status: "booked" | "cancelled" };

type DayState =
  | { kind: "visit"; visit: CalendarVisit }
  | { kind: "upcoming"; visitTypeId: string | null; booked: boolean }
  | { kind: "unmarked"; visitTypeId: string | null; booked: boolean }
  | { kind: "none" };

const LOOK: Record<SessionStatus, { symbol: string; label: string; className: string }> = {
  attended: { symbol: "✓", label: "Present", className: "bg-ok text-bg" },
  missed: { symbol: "✗", label: "Absent", className: "bg-bad text-bg" },
  cancelled_patient: { symbol: "⊘", label: "Cancelled by patient", className: "bg-warn-soft text-warn ring-1 ring-warn/50" },
  cancelled_clinic: { symbol: "⊘", label: "Cancelled by clinic", className: "bg-surface-2 text-muted ring-1 ring-border" },
};

const WEEK_HEADER = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A month view of one patient's visits: what happened on each day, what's
 * coming up, and scheduled days that were never marked. Phones show one month;
 * wider screens show last month and this month side by side. Tapping a day
 * shows it, with Edit (recorded visit) or Mark it (unmarked past day).
 */
export function VisitCalendar({
  patientId,
  visits,
  plans,
  bookings,
  defaultType,
  typeNames,
  today,
}: {
  patientId: string;
  visits: CalendarVisit[];
  plans: Plan[];
  bookings: CalendarBooking[];
  defaultType: string | null;
  typeNames: Record<string, string>;
  today: string;
}) {
  // The right-hand (or only) month shown.
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);

  const byDate = new Map(visits.map((v) => [v.date, v]));
  const bookingOn = new Map(bookings.filter((b) => b.status === "booked").map((b) => [b.date, b]));
  const earliest = [visits.map((v) => v.date).sort()[0], plans.map((p) => p.valid_from).sort()[0], today].filter(Boolean).sort()[0]!;
  const minMonth = earliest.slice(0, 7);
  const maxMonth = addMonths(today.slice(0, 7), 2);
  const typeName = (id: string | null) => (id ? typeNames[id] : undefined) ?? "Session";

  function stateOf(date: string): DayState {
    const visit = byDate.get(date);
    if (visit) return { kind: "visit", visit };
    const booking = bookingOn.get(date);
    const plan = plans.find((p) => isActiveOn(p, date));
    const scheduled = Boolean(plan && isScheduledDay(plan, date));
    if (!booking && !scheduled) return { kind: "none" };
    const visitTypeId = booking?.visitTypeId ?? (plan ? planVisitType(plan, date) : null) ?? defaultType;
    // Today isn't over yet: an unmarked session today is still coming up.
    return date >= today ? { kind: "upcoming", visitTypeId, booked: Boolean(booking) } : { kind: "unmarked", visitTypeId, booked: Boolean(booking) };
  }

  const pickedState = picked ? stateOf(picked) : undefined;
  const prevMonth = addMonths(month, -1);

  function renderMonth(m: string, className = "") {
    const first = `${m}-01`;
    const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => addDays(first, i));
    const states = new Map(days.map((d) => [d, stateOf(d)]));
    const count = (pred: (s: DayState) => boolean) => days.filter((d) => pred(states.get(d)!)).length;
    const present = count((s) => s.kind === "visit" && s.visit.status === "attended");
    const absent = count((s) => s.kind === "visit" && s.visit.status === "missed");
    const cancelled = count((s) => s.kind === "visit" && s.visit.status.startsWith("cancelled"));
    const upcoming = count((s) => s.kind === "upcoming");
    const unmarked = count((s) => s.kind === "unmarked");
    const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

    return (
      <div key={m} className={`space-y-2 ${className}`}>
        <p className="text-center text-base font-semibold">{label}</p>
        <div className="mx-auto grid max-w-sm grid-cols-7 gap-1 text-center">
          {WEEK_HEADER.map((d, i) => (
            <span key={i} className="py-1 text-xs text-muted">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad${i}`} />
          ))}
          {days.map((d) => {
            const s = states.get(d)!;
            const dayNum = +d.slice(8);
            const base = "relative flex h-11 flex-col items-center justify-center rounded-lg text-sm leading-none";
            const ring = `${d === today ? " outline-2 outline-offset-1 outline-brand" : ""}${d === picked ? " ring-2 ring-fg" : ""}`;
            const select = () => setPicked(picked === d ? null : d);

            if (s.kind === "visit") {
              const look = LOOK[s.visit.status];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={select}
                  title={`${look.label} · ${typeName(s.visit.visitTypeId)}`}
                  aria-label={`${dayNum}: ${look.label}`}
                  className={`${base} font-semibold ${look.className}${ring}`}
                >
                  {dayNum}
                  <span className="text-[10px]">{look.symbol}</span>
                </button>
              );
            }
            if (s.kind === "upcoming" || s.kind === "unmarked") {
              const what = s.kind === "upcoming" ? `Coming up${s.booked ? " (booked)" : ""}` : "Not marked";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={select}
                  title={`${what} · ${typeName(s.visitTypeId)}`}
                  aria-label={`${dayNum}: ${what}`}
                  className={`${base} font-medium ${
                    s.kind === "upcoming" ? "border-2 border-chart text-fg" : "border-2 border-dashed border-warn text-warn"
                  }${ring}`}
                >
                  {dayNum}
                  <span className="text-[10px]">{s.kind === "upcoming" ? "○" : "?"}</span>
                </button>
              );
            }
            return (
              <span key={d} className={`${base} text-muted${ring}`}>
                {dayNum}
              </span>
            );
          })}
        </div>
        <p className="text-center text-sm text-muted">
          {present} present
          {absent > 0 && ` · ${absent} absent`}
          {cancelled > 0 && ` · ${cancelled} cancelled`}
          {upcoming > 0 && ` · ${upcoming} coming up`}
          {unmarked > 0 && <span className="font-medium text-warn"> · {unmarked} not marked</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          // On wide screens the left grid already shows the month before `month`.
          disabled={month <= minMonth}
          className="btn min-h-10 px-3"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm text-muted">Tap a day for details</span>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={month >= maxMonth}
          className="btn min-h-10 px-3"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {renderMonth(prevMonth, "hidden md:block")}
        {renderMonth(month)}
      </div>

      {/* What the tapped day was / will be, with the action that fits it. */}
      {picked && pickedState && pickedState.kind !== "none" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-base">
            <span className="font-medium">{fmt(picked)}</span>
            <span className="block text-sm text-muted">
              {pickedState.kind === "visit"
                ? `${LOOK[pickedState.visit.status].label} · ${typeName(pickedState.visit.visitTypeId)}${pickedState.visit.pain !== null ? ` · pain ${pickedState.visit.pain}/10` : ""}`
                : pickedState.kind === "upcoming"
                  ? `${picked === today ? "Today · not marked yet" : pickedState.booked ? "Booked" : "Scheduled"} · ${typeName(pickedState.visitTypeId)}`
                  : `Scheduled but not marked · ${typeName(pickedState.visitTypeId)}`}
            </span>
          </span>
          {pickedState.kind === "visit" && (
            <Link href={`/patients/${patientId}/visits/${pickedState.visit.id}`} className="btn shrink-0">
              Edit
            </Link>
          )}
          {(pickedState.kind === "unmarked" || (pickedState.kind === "upcoming" && picked === today)) && (
            <Link href={`/patients/${patientId}/attendance?date=${picked}`} className="btn btn-primary shrink-0">
              Mark it
            </Link>
          )}
        </div>
      )}

      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="Legend">
        <Legend swatch="bg-ok text-bg" symbol="✓" label="Present" />
        <Legend swatch="bg-bad text-bg" symbol="✗" label="Absent" />
        <Legend swatch="bg-warn-soft text-warn ring-1 ring-warn/50" symbol="⊘" label="Cancelled" />
        <Legend swatch="border-2 border-chart" symbol="○" label="Coming up" />
        <Legend swatch="border-2 border-dashed border-warn text-warn" symbol="?" label="Not marked" />
      </ul>
    </div>
  );
}

function Legend({ swatch, symbol, label }: { swatch: string; symbol: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`flex size-4 items-center justify-center rounded text-[9px] ${swatch}`}>{symbol}</span>
      {label}
    </li>
  );
}

function addMonths(month: string, delta: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function fmt(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
