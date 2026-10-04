"use client";

import { msg } from "@/i18n";
import { useT } from "@/i18n/client";

export const METHODS = [
  { value: "upi", label: msg("UPI") },
  { value: "cash", label: msg("Cash") },
  { value: "card", label: msg("Card") },
  { value: "bank", label: msg("Bank transfer") },
  { value: "other", label: msg("Other") },
];

/** "Paid by" as big tappable choices instead of a dropdown. Submits `method`. */
export function MethodPicker({ defaultValue = "upi" }: { defaultValue?: string }) {
  const t = useT();
  return (
    <fieldset className="field">
      <legend className="mb-1.5">{t("Paid by")}</legend>
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <label
            key={m.value}
            className="flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-surface px-4 text-base font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
          >
            <input type="radio" name="method" value={m.value} defaultChecked={m.value === defaultValue} className="sr-only" />
            {t(m.label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
