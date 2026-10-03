"use client";

import { useEffect, useRef, useState } from "react";
import { parseDateInput, toDisplay } from "@/lib/date-input";
import { isoWeekday, WEEKDAYS } from "@/lib/schedule";
import { DateField } from "./date-field";

type Mark = "attended" | "missed";

function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const WEEK_HEADER = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Calendar for entering many past visits at once. Tap a day once = attended,
 * again = missed, again = clear. Dates can also be typed. Days that already
 * have a visit are shown and can't be picked again.
 * Submits `attended_dates` and `missed_dates` (ISO, repeated).
 */
export function MultiDateField({
  today,
  existing = {},
  scheduleDays = [],
}: {
  today: string;
  existing?: Record<string, string>;
  /** Weekdays the patient usually comes (pre-selected when filling a date range). */
  scheduleDays?: number[];
}) {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState(today);
  const [rangeDays, setRangeDays] = useState<number[]>(scheduleDays.length ? scheduleDays : [1, 2, 3, 4, 5, 6]);
  const [rangeMark, setRangeMark] = useState<Mark>("attended");
  const [rangeNote, setRangeNote] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Clear after a successful save (the form resets).
  useEffect(() => {
    const form = wrapRef.current?.closest("form");
    const onReset = () => setMarks({});
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, []);

  function cycle(date: string) {
    setMarks((m) => {
      const next = { ...m };
      if (!m[date]) next[date] = "attended";
      else if (m[date] === "attended") next[date] = "missed";
      else delete next[date];
      return next;
    });
  }

  function addTyped() {
    const d = parseDateInput(typed, today);
    if (!d) return setTypedError("Use DD/MM/YYYY");
    if (d > today) return setTypedError("Can't be in the future");
    if (existing[d]) return setTypedError(`${toDisplay(d)} is already recorded`);
    setMarks((m) => ({ ...m, [d]: m[d] ?? "attended" }));
    setMonth(d.slice(0, 7));
    setTyped("");
    setTypedError("");
  }

  /** Tick every chosen weekday between the two dates (skipping future and already-recorded days). */
  function fillRange() {
    if (!rangeFrom || !rangeTo) return setRangeNote("Pick both dates first.");
    if (rangeFrom > rangeTo) return setRangeNote("The “from” date must be before the “to” date.");
    if (rangeDays.length === 0) return setRangeNote("Pick at least one weekday.");
    const picked: string[] = [];
    for (let d = rangeFrom; d <= rangeTo && d <= today; d = shift(d, 1)) {
      if (rangeDays.includes(isoWeekday(d)) && !existing[d]) picked.push(d);
      if (picked.length > 400) break;
    }
    if (picked.length === 0) return setRangeNote("No new days in that range (they may already be recorded).");
    setMarks((m) => ({ ...m, ...Object.fromEntries(picked.map((d) => [d, rangeMark])) }));
    setMonth(picked.at(-1)!.slice(0, 7));
    setRangeNote(`Ticked ${picked.length} day${picked.length === 1 ? "" : "s"} — check the calendar below and tap any day to change it.`);
  }

  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => shift(first, i))];
  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

  const picked = Object.entries(marks).sort(([a], [b]) => a.localeCompare(b));
  const attended = picked.filter(([, m]) => m === "attended").map(([d]) => d);
  const missed = picked.filter(([, m]) => m === "missed").map(([d]) => d);

  return (
    <div ref={wrapRef} className="space-y-3">
      {attended.map((d) => (
        <input key={`a${d}`} type="hidden" name="attended_dates" value={d} />
      ))}
      {missed.map((d) => (
        <input key={`m${d}`} type="hidden" name="missed_dates" value={d} />
      ))}

      <p className="text-xs text-muted">
        Tap a day: once = <span className="font-medium text-ok">✓ attended</span>, twice = <span className="font-medium text-bad">✗ missed</span>,
        three times = clear.
      </p>

      {/* Side by side on wider screens so the whole thing fits on a laptop. */}
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <details className="rounded-2xl bg-surface-2 p-3" open>
          <summary className="cursor-pointer text-base font-medium">Fill a date range</summary>
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <DateField name="range_from" label="From" today={today} max={today} shortcuts={[]} onChange={setRangeFrom} />
              <DateField name="range_to" label="To" today={today} defaultValue={today} max={today} shortcuts={["today"]} onChange={setRangeTo} />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">On these days</legend>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => {
                  const on = rangeDays.includes(w.n);
                  return (
                    <button
                      key={w.n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRangeDays((d) => (on ? d.filter((x) => x !== w.n) : [...d, w.n]))}
                      className={`min-h-10 rounded-xl border text-sm font-medium ${on ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-muted"}`}
                    >
                      {w.short.slice(0, 2)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Mark them</span>
              {(["attended", "missed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={rangeMark === m}
                  onClick={() => setRangeMark(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    rangeMark === m ? (m === "attended" ? "border-ok bg-ok-soft text-ok" : "border-bad bg-bad-soft text-bad") : "border-border text-muted"
                  }`}
                >
                  {m === "attended" ? "✓ Present" : "✗ Absent"}
                </button>
              ))}
            </div>
            <button type="button" onClick={fillRange} className="btn w-full text-base">
              Tick these days on the calendar
            </button>
            {rangeNote && <p className="text-sm text-muted">{rangeNote}</p>}
          </div>
        </details>

        <div className="space-y-3">
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => moveMonth(-1)} className="btn min-h-9 px-3" aria-label="Previous month">
                ‹
              </button>
              <span className="text-sm font-medium">{monthLabel}</span>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                disabled={month >= today.slice(0, 7)}
                className="btn min-h-9 px-3"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEK_HEADER.map((d, i) => (
                <span key={i} className="py-1 text-muted">
                  {d}
                </span>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <span key={`pad-${i}`} />;
                const mark = marks[d];
                const already = existing[d];
                const future = d > today;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={future || Boolean(already)}
                    onClick={() => cycle(d)}
                    aria-label={`${toDisplay(d)}${mark ? ` – ${mark}` : already ? " – already recorded" : ""}`}
                    className={`relative h-10 rounded-lg text-sm font-medium disabled:cursor-not-allowed ${
                      mark === "attended"
                        ? "bg-ok text-bg"
                        : mark === "missed"
                          ? "bg-bad text-bg"
                          : already
                            ? "bg-surface-2 text-muted"
                            : future
                              ? "opacity-30"
                              : d === today
                                ? "ring-1 ring-brand text-brand"
                                : "hover:bg-surface-2"
                    }`}
                  >
                    {+d.slice(8)}
                    {already && <span className="absolute inset-x-0 bottom-0.5 text-[9px] leading-none">{already === "attended" ? "✓" : "✗"}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setTypedError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
              placeholder="Or type a date: DD/MM/YYYY"
              inputMode="numeric"
              aria-label="Type a date to add"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-brand"
            />
            <button type="button" onClick={addTyped} className="btn shrink-0">
              Add
            </button>
          </div>
          {typedError && <p className="text-xs text-bad">{typedError}</p>}

          {picked.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm">
                <span className="font-medium text-ok">{attended.length} attended</span>
                {missed.length > 0 && <span className="font-medium text-bad"> · {missed.length} missed</span>}
                <button type="button" onClick={() => setMarks({})} className="ml-2 text-xs text-muted underline">
                  clear all
                </button>
              </p>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {picked.map(([d, m]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => cycle(d)}
                    className={`chip ${m === "attended" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}
                    title="Tap to change"
                  >
                    {m === "attended" ? "✓" : "✗"} {toDisplay(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
