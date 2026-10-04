"use client";

import Link from "next/link";
import { useState } from "react";
import { restorePatientDay } from "@/app/(app)/actions";
import { describeOff, offOn, type DayOff } from "@/lib/days-off";
import { msg } from "@/i18n";
import { useT } from "@/i18n/client";
import { addDays, isActiveOn, isScheduledDay, planVisitType, type Plan } from "@/lib/schedule";
import type { SessionStatus } from "@/lib/types";

export type CalendarVisit = { id: string; date: string; status: SessionStatus; visitTypeId: string | null; pain: number | null };
export type CalendarBooking = { date: string; visitTypeId: string | null; status: "booked" | "cancelled" };

type DayState =
  | { kind: "visit"; visit: CalendarVisit }
  | { kind: "upcoming"; visitTypeId: string | null; booked: boolean }
  | { kind: "unmarked"; visitTypeId: string | null; booked: boolean }
  | { kind: "off"; visitTypeId: string | null; off: DayOff }
  | { kind: "none" };

const LOOK: Record<SessionStatus, { symbol: string; label: string; className: string }> = {
  attended: { symbol: "✓", label: msg("Present"), className: "bg-ok text-bg" },
  missed: { symbol: "✗", label: msg("Absent"), className: "bg-bad text-bg" },
  cancelled_patient: { symbol: "⊘", label: msg("Cancelled by patient"), className: "bg-warn-soft text-warn ring-1 ring-warn/50" },
  cancelled_clinic: { symbol: "⊘", label: msg("Cancelled by clinic"), className: "bg-surface-2 text-muted ring-1 ring-border" },
};


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
  daysOff = [],
}: {
  patientId: string;
  visits: CalendarVisit[];
  plans: Plan[];
  bookings: CalendarBooking[];
  defaultType: string | null;
  typeNames: Record<string, string>;
  today: string;
  daysOff?: DayOff[];
}) {
  // The right-hand (or only) month shown.
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  // "Cancel days" mode: tap several upcoming days, then cancel them together.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const t = useT();
  // Monday-first single letters in the physio's language; 1 Jan 2024 was a Monday.
  const weekHeader = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(t.intl, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, i + 1))),
  );
  const fmt = (date: string) => t.day(date);

  const byDate = new Map(visits.map((v) => [v.date, v]));
  const bookingOn = new Map(bookings.filter((b) => b.status === "booked").map((b) => [b.date, b]));
  const earliest = [visits.map((v) => v.date).sort()[0], plans.map((p) => p.valid_from).sort()[0], today].filter(Boolean).sort()[0]!;
  const minMonth = earliest.slice(0, 7);
  const maxMonth = addMonths(today.slice(0, 7), 2);
  const typeName = (id: string | null) => (id ? typeNames[id] : undefined) ?? t("Session");

  function stateOf(date: string): DayState {
    const visit = byDate.get(date);
    if (visit) return { kind: "visit", visit };
    const booking = bookingOn.get(date);
    const plan = plans.find((p) => isActiveOn(p, date));
    const scheduled = Boolean(plan && isScheduledDay(plan, date));
    if (!booking && !scheduled) return { kind: "none" };
    const visitTypeId = booking?.visitTypeId ?? (plan ? planVisitType(plan, date) : null) ?? defaultType;
    const off = offOn(daysOff, patientId, date);
    if (off) return { kind: "off", visitTypeId, off };
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
    const label = new Intl.DateTimeFormat(t.intl, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

    return (
      <div key={m} className={`space-y-2 ${className}`}>
        <p className="text-center text-base font-semibold">{label}</p>
        <div className="mx-auto grid max-w-sm grid-cols-7 gap-1 text-center">
          {weekHeader.map((d, i) => (
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
            const isSelected = selected.includes(d);
            const select = () => {
              if (selecting) {
                if (s.kind === "upcoming") setSelected((xs) => (isSelected ? xs.filter((x) => x !== d) : [...xs, d].sort()));
                return;
              }
              setPicked(picked === d ? null : d);
            };

            if (s.kind === "visit") {
              const look = LOOK[s.visit.status];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={select}
                  title={`${look.label} · ${typeName(s.visit.visitTypeId)}`}
                  aria-label={`${dayNum}: ${t(look.label)}`}
                  className={`${base} font-semibold ${look.className}${ring}`}
                >
                  {dayNum}
                  <span className="text-[10px]">{look.symbol}</span>
                </button>
              );
            }
            if (s.kind === "off") {
              return (
                <button
                  key={d}
                  type="button"
                  onClick={select}
                  title={describeOff(s.off, t)}
                  aria-label={`${dayNum}: ${t("Cancelled in advance")}`}
                  className={`${base} border-2 border-dashed border-border text-muted${ring}`}
                >
                  <span className="line-through">{dayNum}</span>
                  <span className="text-[10px]">⊘</span>
                </button>
              );
            }
            if (s.kind === "upcoming" || s.kind === "unmarked") {
              const what = s.kind === "upcoming" ? (s.booked ? t("Coming up (booked)") : t("Coming up")) : t("Not marked");
              return (
                <button
                  key={d}
                  type="button"
                  onClick={select}
                  title={`${what} · ${typeName(s.visitTypeId)}`}
                  aria-label={`${dayNum}: ${what}`}
                  aria-pressed={selecting ? isSelected : undefined}
                  className={`${base} font-medium ${
                    isSelected
                      ? "border-2 border-bad bg-bad-soft text-bad"
                      : s.kind === "upcoming"
                        ? "border-2 border-chart text-fg"
                        : "border-2 border-dashed border-warn text-warn"
                  }${selecting && s.kind !== "upcoming" ? " opacity-40" : ""}${ring}`}
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
          {t("{n} present", { n: present })}
          {absent > 0 && ` · ${t("{n} absent", { n: absent })}`}
          {cancelled > 0 && ` · ${t("{n} cancelled", { n: cancelled })}`}
          {upcoming > 0 && ` · ${t("{n} coming up", { n: upcoming })}`}
          {unmarked > 0 && <span className="font-medium text-warn"> · {t("{n} not marked", { n: unmarked })}</span>}
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
          aria-label={t("Previous month")}
        >
          ‹
        </button>
        {selecting ? (
          <span className="text-sm font-medium text-bad">{t("Tap the days to cancel")}</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSelecting(true);
              setPicked(null);
            }}
            className="btn min-h-10 px-3 text-sm"
          >
            {t("Cancel days…")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={month >= maxMonth}
          className="btn min-h-10 px-3"
          aria-label={t("Next month")}
        >
          ›
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {renderMonth(prevMonth, "hidden md:block")}
        {renderMonth(month)}
      </div>

      {selecting && (
        <div className="flex items-center gap-2 rounded-2xl bg-bad-soft px-3 py-2">
          <span className="flex-1 text-sm text-bad">
            {selected.length === 0 ? t("No days picked yet") : selected.length === 1 ? t("1 day picked") : t("{n} days picked", { n: selected.length })}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelecting(false);
              setSelected([]);
            }}
            className="btn min-h-10 px-3 text-sm"
          >
            {t("Back")}
          </button>
          {selected.length > 0 && (
            <Link href={`/patients/${patientId}/cancel-days?dates=${selected.join(",")}`} className="btn min-h-10 border-bad bg-bad px-3 text-sm text-white">
              {selected.length === 1 ? t("Cancel this day") : t("Cancel {n} days", { n: selected.length })}
            </Link>
          )}
        </div>
      )}

      {/* What the tapped day was / will be, with the action that fits it. */}
      {!selecting && picked && pickedState && pickedState.kind !== "none" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-base">
            <span className="font-medium">{fmt(picked)}</span>
            <span className="block text-sm text-muted">
              {pickedState.kind === "visit"
                ? `${t(LOOK[pickedState.visit.status].label)} · ${typeName(pickedState.visit.visitTypeId)}${pickedState.visit.pain !== null ? ` · ${t("pain {n}/10", { n: pickedState.visit.pain })}` : ""}`
                : pickedState.kind === "off"
                  ? `${describeOff(pickedState.off, t)} · ${typeName(pickedState.visitTypeId)}`
                  : pickedState.kind === "upcoming"
                    ? `${picked === today ? t("Today · not marked yet") : pickedState.booked ? t("Booked") : t("Scheduled")} · ${typeName(pickedState.visitTypeId)}`
                    : `${t("Scheduled but not marked")} · ${typeName(pickedState.visitTypeId)}`}
            </span>
          </span>
          {pickedState.kind === "upcoming" && picked > today && (
            <Link href={`/patients/${patientId}/cancel-days?dates=${picked}`} className="btn shrink-0 text-bad">
              {t("Cancel this day")}
            </Link>
          )}
          {pickedState.kind === "off" &&
            (pickedState.off.patient_id && pickedState.off.from_date === pickedState.off.to_date ? (
              <form action={restorePatientDay.bind(null, pickedState.off.id, patientId)}>
                <button type="submit" className="btn shrink-0">
                  {t("Restore")}
                </button>
              </form>
            ) : (
              <Link href={pickedState.off.patient_id ? `/patients/${patientId}?tab=schedule` : "/profile/days-off"} className="btn shrink-0">
                {t("Manage")}
              </Link>
            ))}
          {pickedState.kind === "visit" && (
            <Link href={`/patients/${patientId}/visits/${pickedState.visit.id}`} className="btn shrink-0">
              {t("Edit")}
            </Link>
          )}
          {(pickedState.kind === "unmarked" || (pickedState.kind === "upcoming" && picked === today)) && (
            <Link href={`/patients/${patientId}/attendance?date=${picked}`} className="btn btn-primary shrink-0">
              {t("Mark it")}
            </Link>
          )}
        </div>
      )}

      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-muted" aria-label={t("Legend")}>
        <Legend swatch="bg-ok text-bg" symbol="✓" label={t("Present")} />
        <Legend swatch="bg-bad text-bg" symbol="✗" label={t("Absent")} />
        <Legend swatch="bg-warn-soft text-warn ring-1 ring-warn/50" symbol="⊘" label={t("Cancelled")} />
        <Legend swatch="border-2 border-chart" symbol="○" label={t("Coming up")} />
        <Legend swatch="border-2 border-dashed border-warn text-warn" symbol="?" label={t("Not marked")} />
        <Legend swatch="border-2 border-dashed border-border text-muted" symbol="⊘" label={t("Cancelled in advance")} />
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

