"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

type Option = { value: string; label: string; hint?: string; withAmount?: boolean };

/** Big radio choices; the option marked `withAmount` reveals an amount box. */
export function ChoiceWithAmount({
  legend,
  name,
  amountName,
  options,
  defaultValue,
  defaultAmount,
}: {
  legend: string;
  name: string;
  amountName: string;
  options: Option[];
  defaultValue: string;
  defaultAmount?: number | null;
}) {
  const [value, setValue] = useState(defaultValue);
  const t = useT();
  const showAmount = options.find((o) => o.value === value)?.withAmount;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-base font-medium">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-border px-4 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => setValue(o.value)}
            className="size-5 accent-[var(--brand)]"
          />
          <span>
            <span className="block text-base font-medium">{o.label}</span>
            {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
      {showAmount && (
        <label className="field pt-1">
          <span>{t("Amount")}</span>
          <input
            name={amountName}
            inputMode="decimal"
            required
            defaultValue={defaultAmount ?? ""}
            placeholder={t("e.g. 500")}
            className="!text-xl font-semibold"
          />
        </label>
      )}
    </fieldset>
  );
}
