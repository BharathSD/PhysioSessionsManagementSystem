"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/schedule";
import type { VisitType } from "@/lib/types";
import { msg } from "@/i18n";
import { useT } from "@/i18n/client";
import { DateField } from "./date-field";

type Mode = "none" | "fixed_days" | "flexible";

// Fixed-day presets are labelled with the weekday names ("Mon / Wed / Fri").
const PRESETS: { label?: string; mode: Mode; days?: number[]; k?: number; n: number }[] = [
  { mode: "fixed_days", days: [1, 3, 5], n: 1 },
  { mode: "fixed_days", days: [2, 4, 6], n: 1 },
  { label: msg("Twice a week"), mode: "flexible", k: 2, n: 1 },
  { label: msg("Once a week"), mode: "flexible", k: 1, n: 1 },
  { label: msg("Every 2 weeks"), mode: "flexible", k: 1, n: 2 },
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
  const t = useT();
  const presetLabel = (p: (typeof PRESETS)[number]) => (p.label ? t(p.label) : p.days!.map((d) => t.weekday(d)).join(" / "));

  const modes: { value: Mode; label: string }[] = [
    ...(allowNone ? [{ value: "none" as const, label: t("No schedule") }] : []),
    { value: "fixed_days", label: t("Fixed days") },
    { value: "flexible", label: t("Any days") },
  ];

  return (
    <div className="space-y-3">
      <input type="hidden" name="plan_mode" value={mode} />

      <p className="text-sm font-medium text-muted">{t("Quick choices")}</p>
      <div className="-mt-1 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={presetLabel(p)}
            type="button"
            onClick={() => {
              setMode(p.mode);
              setN(p.n);
              if (p.days) setDays(p.days);
              if (p.k) setK(p.k);
            }}
            className="rounded-full border border-border px-3.5 py-2 text-sm font-medium text-fg hover:border-brand hover:text-brand"
          >
            {presetLabel(p)}
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
          <legend className="mb-1.5 text-base font-medium">{t("Which days?")}</legend>
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
                  {t.locale === "en" ? w.short.slice(0, 2) : t.weekday(w.n)}
                </label>
              );
            })}
          </div>
          {days.length > 1 && types.length > 1 && (
            <div className="rounded-2xl bg-surface-2 p-3">
              <label className="flex cursor-pointer items-center gap-3 text-base font-medium">
                <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} className="size-5 accent-[var(--brand)]" />
                {t("Different visit type on some days")}
              </label>
              {mixed && (
                <div className="mt-3 space-y-2">
                  {WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => (
                    <label key={w.n} className="field flex-row items-center gap-3">
                      <span className="w-10 shrink-0">{t.weekday(w.n)}</span>
                      <select name={`day_type_${w.n}`} defaultValue={planType}>
                        {types.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <p className="text-sm text-muted">{t("e.g. Mon & Wed in clinic, Sat as a home visit.")}</p>
                </div>
              )}
            </div>
          )}
          <label className="field">
            <span>{t("Repeat")}</span>
            <select name="every_n_weeks" value={n} onChange={(e) => setN(+e.target.value)}>
              <option value={1}>{t("Every week")}</option>
              <option value={2}>{t("Every 2 weeks (alternate weeks)")}</option>
              <option value={3}>{t("Every {n} weeks", { n: 3 })}</option>
              <option value={4}>{t("Every {n} weeks", { n: 4 })}</option>
            </select>
          </label>
        </fieldset>
      )}

      {mode === "flexible" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>{t("Sessions")}</span>
            <input name="sessions_per_period" type="number" inputMode="numeric" min={1} max={14} value={k} onChange={(e) => setK(+e.target.value)} />
          </label>
          <label className="field">
            <span>{t("Every")}</span>
            <select name="every_n_weeks" value={n} onChange={(e) => setN(+e.target.value)}>
              <option value={1}>{t("1 week")}</option>
              {[2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  {t("{n} weeks", { n: w })}
                </option>
              ))}
            </select>
          </label>
          <p className="col-span-2 -mt-1 text-sm text-muted">{t("The patient picks the days — e.g. 2 sessions every 1 week = twice a week.")}</p>
        </div>
      )}

      {mode !== "none" && (
        <>
          {types.length > 0 && (
            <label className="field">
              <span>{mode === "fixed_days" && mixed ? t("Main visit type") : t("Visit type")}</span>
              <select name="plan_visit_type" value={planType} onChange={(e) => setPlanType(e.target.value)}>
                {types.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DateField name="plan_from" label={t("Starts on")} today={today} defaultValue={today} shortcuts={["today", "tomorrow"]} required />
          <label className="field">
            <span>
              {t("Note")} <em>{t("(optional)")}</em>
            </span>
            <input name="plan_note" placeholder={t("e.g. Phase 2 – strengthening")} />
          </label>
        </>
      )}
    </div>
  );
}
