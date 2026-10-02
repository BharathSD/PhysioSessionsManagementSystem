"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseDateInput, toDisplay } from "@/lib/date-input";

type Shortcut = "today" | "yesterday" | "tomorrow";

const SHORTCUT_OFFSET: Record<Shortcut, number> = { yesterday: -1, today: 0, tomorrow: 1 };
const WEEK_HEADER = ["M", "T", "W", "T", "F", "S", "S"];

function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function friendly(date: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * Date input that can be typed (02/10/2026, 2/10, 02102026, "today") or picked
 * from a calendar, with one-tap shortcuts. Submits ISO (YYYY-MM-DD) as `name`.
 * `today` comes from the server so it follows the clinic's timezone.
 */
export function DateField({
  name,
  label,
  today,
  defaultValue = "",
  min,
  max,
  required,
  shortcuts = ["today"],
}: {
  name: string;
  label: React.ReactNode;
  today: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  required?: boolean;
  shortcuts?: Shortcut[];
}) {
  const [value, setValue] = useState(defaultValue);
  const [text, setText] = useState(defaultValue ? toDisplay(defaultValue) : "");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((defaultValue || today).slice(0, 7));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const parsed = parseDateInput(text, today);
  const error = !text.trim()
    ? required
      ? "Pick a date"
      : ""
    : !parsed
      ? "Use DD/MM/YYYY, e.g. 02/10/2026"
      : min && parsed < min
        ? `Can't be before ${toDisplay(min)}`
        : max && parsed > max
          ? `Can't be after ${toDisplay(max)}`
          : "";

  useEffect(() => {
    inputRef.current?.setCustomValidity(error);
  }, [error]);

  // Follow the native form reset (e.g. after "Save" clears the form).
  useEffect(() => {
    const form = wrapRef.current?.closest("form");
    const onReset = () => {
      setValue(defaultValue);
      setText(defaultValue ? toDisplay(defaultValue) : "");
      setOpen(false);
    };
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [defaultValue]);

  // Close the calendar on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(date: string) {
    setValue(date);
    setText(toDisplay(date));
    setMonth(date.slice(0, 7));
    setOpen(false);
  }

  function onType(next: string) {
    setText(next);
    const p = parseDateInput(next, today);
    setValue(p ?? "");
    if (p) setMonth(p.slice(0, 7));
  }

  // Calendar grid for the visible month, Monday first.
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => shift(first, i))];
  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${first}T00:00:00Z`),
  );

  return (
    <div ref={wrapRef} className="field relative">
      <label htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => parsed && setText(toDisplay(parsed))}
          placeholder="DD/MM/YYYY"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-invalid={Boolean(text && error)}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn shrink-0 px-3"
          aria-label="Open calendar"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
            <path d="M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" />
          </svg>
        </button>
      </div>
      <input type="hidden" name={name} value={value} />

      <div className="flex flex-wrap items-center gap-1.5 font-normal">
        {shortcuts.map((s) => {
          const d = shift(today, SHORTCUT_OFFSET[s]);
          const disabled = (min && d < min) || (max && d > max);
          return disabled ? null : (
            <button
              key={s}
              type="button"
              onClick={() => choose(d)}
              className={`chip border ${value === d ? "border-brand bg-brand-soft text-brand" : "border-border text-muted"}`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          );
        })}
        <span className={`text-xs ${text && error ? "text-bad" : "text-muted"}`}>
          {text && error ? error : value ? friendly(value) : ""}
        </span>
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-2xl border border-border bg-surface p-3 font-normal shadow-xl sm:left-auto sm:w-80">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth(-1)} className="btn min-h-9 px-3" aria-label="Previous month">
              ‹
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={() => moveMonth(1)} className="btn min-h-9 px-3" aria-label="Next month">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEK_HEADER.map((d, i) => (
              <span key={i} className="py-1 text-muted">
                {d}
              </span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  disabled={Boolean((min && d < min) || (max && d > max))}
                  onClick={() => choose(d)}
                  aria-label={friendly(d)}
                  aria-pressed={d === value}
                  className={`aspect-square rounded-lg text-sm disabled:opacity-30 ${
                    d === value ? "bg-brand text-brand-fg" : d === today ? "ring-1 ring-brand text-brand" : "hover:bg-surface-2"
                  }`}
                >
                  {+d.slice(8)}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
