"use client";

import { useT } from "@/i18n/client";
import { CASE_SECTIONS as SECTIONS, type CaseText } from "@/lib/case-sections";
import { DateField } from "./date-field";

/** The free-text initial assessment of a case. */
export function CaseFields({ today, defaults = {} }: { today: string; defaults?: CaseText }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <label className="field">
          <span>{t("Case title")}</span>
          <input name="title" required defaultValue={defaults.title ?? ""} placeholder={t("e.g. Right knee — ACL reconstruction")} />
        </label>
        <DateField name="opened_on" label={t("Started on")} today={today} defaultValue={defaults.opened_on ?? today} max={today} shortcuts={["today"]} />
      </div>
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("Initial assessment")}</h2>
        <p className="-mt-2 text-sm text-muted">{t("Free text — fill in what's useful, skip the rest. You can edit it later.")}</p>
        {SECTIONS.map((s) => (
          <label key={s.name} className="field">
            <span>{t(s.label)}</span>
            <textarea name={s.name} rows={s.rows} defaultValue={defaults[s.name] ?? ""} placeholder={s.hint && t(s.hint)} />
          </label>
        ))}
      </div>
    </div>
  );
}

