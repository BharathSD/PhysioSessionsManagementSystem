"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/schedule";
import type { VisitType } from "@/lib/types";
import { DateField } from "./date-field";

type Mode = "none" | "fixed_days" | "flexible";

const PRESETS: { label: string; mode: Mode; days?: number[]; k?: number; n: number }[] = [
  { label: "Mon / Wed / Fri", mode: "fixed_days", days: [1, 3, 5], n: 1 },
  { label: "Tue / Thu / Sat", mode: "fixed_days", days: [2, 4, 6], n: 1 },
  { label: "Twice a week", mode: "flexible", k: 2, n: 1 },
  { label: "Once a week", mode: "flexible", k: 1, n: 1 },
  { label: "Every 2 weeks", mode: "flexible", k: 1, n: 2 },
];

/**
 * Fields for a schedule. Submits plan_mode, weekdays[], every_n_weeks,
 * sessions_per_period, plan_visit_type, day_type_<weekday> (mixed schedules),
 * plan_from and plan_note.
 */
export function PlanFields({
  today,
  types,
  defaultType,
  allowNone = false,
}: {
  today: string;
  types: VisitType[];
  defaultType: string | null;
  allowNone?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(allowNone ? "none" : "fixed_days");
  const [planType, setPlanType] = useState(defaultType ?? types[0]?.id ?? "");
  const [mixed, setMixed] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [k, setK] = useState(2);
  const [n, setN] = useState(1);

  const modes: { value: Mode; label: string }[] = [
    ...(allowNone ? [{ value: "none" as const, label: "No schedule" }] : []),
    { value: "fixed_days", label: "Fixed days" },
    { value: "flexible", label: "Any days" },
  ];

  return (
    <div className="space-y-3">
      <input type="hidden" name="plan_mode" value={mode} />

      <p className="text-sm font-medium text-muted">Quick choices</p>
      <div className="-mt-1 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setMode(p.mode);
              setN(p.n);
              if (p.days) setDays(p.days);
              if (p.k) setK(p.k);
            }}
            className="rounded-full border border-border px-3.5 py-2 text-sm font-medium text-fg hover:border-brand hover:text-brand"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`grid rounded-xl bg-surface-2 p-1 text-sm font-medium ${allowNone ? "grid-cols-3" : "grid-cols-2"}`}>
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            aria-pressed={mode === m.value}
            className={`rounded-lg py-2 ${mode === m.value ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "fixed_days" && (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-base font-medium">Which days?</legend>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => {
              const on = days.includes(w.n);
              return (
                <label
                  key={w.n}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium ${
                    on ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={w.n}
                    checked={on}
                    onChange={() => setDays((d) => (on ? d.filter((x) => x !== w.n) : [...d, w.n]))}
                    className="sr-only"
                  />
                  {w.short.slice(0, 2)}
                </label>
              );
            })}
          </div>
          {days.length > 1 && types.length > 1 && (
            <div className="rounded-2xl bg-surface-2 p-3">
              <label className="flex cursor-pointer items-center gap-3 text-base font-medium">
                <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} className="size-5 accent-[var(--brand)]" />
                Different visit type on some days
              </label>
              {mixed && (
                <div className="mt-3 space-y-2">
                  {WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => (
                    <label key={w.n} className="field flex-row items-center gap-3">
                      <span className="w-10 shrink-0">{w.short}</span>
                      <select name={`day_type_${w.n}`} defaultValue={planType}>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <p className="text-sm text-muted">e.g. Mon & Wed in clinic, Sat as a home visit.</p>
                </div>
              )}
            </div>
          )}
          <label className="field">
            <span>Repeat</span>
            <select name="every_n_weeks" value={n} onChange={(e) => setN(+e.target.value)}>
              <option value={1}>Every week</option>
              <option value={2}>Every 2 weeks (alternate weeks)</option>
              <option value={3}>Every 3 weeks</option>
              <option value={4}>Every 4 weeks</option>
            </select>
          </label>
        </fieldset>
      )}

      {mode === "flexible" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Sessions</span>
            <input name="sessions_per_period" type="number" inputMode="numeric" min={1} max={14} value={k} onChange={(e) => setK(+e.target.value)} />
          </label>
          <label className="field">
            <span>Every</span>
            <select name="every_n_weeks" value={n} onChange={(e) => setN(+e.target.value)}>
              <option value={1}>1 week</option>
              <option value={2}>2 weeks</option>
              <option value={3}>3 weeks</option>
              <option value={4}>4 weeks</option>
            </select>
          </label>
          <p className="col-span-2 -mt-1 text-sm text-muted">The patient picks the days — e.g. 2 sessions every 1 week = twice a week.</p>
        </div>
      )}

      {mode !== "none" && (
        <>
          {types.length > 0 && (
            <label className="field">
              <span>{mode === "fixed_days" && mixed ? "Main visit type" : "Visit type"}</span>
              <select name="plan_visit_type" value={planType} onChange={(e) => setPlanType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DateField name="plan_from" label="Starts on" today={today} defaultValue={today} shortcuts={["today", "tomorrow"]} required />
          <label className="field">
            <span>Note <em>(optional)</em></span>
            <input name="plan_note" placeholder="e.g. Phase 2 – strengthening" />
          </label>
        </>
      )}
    </div>
  );
}
