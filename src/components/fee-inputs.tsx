"use client";

import { useT } from "@/i18n/client";
import type { VisitType } from "@/lib/types";

/**
 * One fee box per visit type (fee_<visit type id>), pre-filled with the fee
 * that applies now. Leaving the default amount (or clearing the box) keeps the
 * patient on the clinic default, so they follow future default changes.
 */
export function FeeInputs({
  types,
  current,
  defaults,
  currency,
}: {
  types: VisitType[];
  /** The fee to show in each box (the patient's own, or the default). */
  current: Record<string, number | null>;
  defaults: Record<string, number | null>;
  currency: string;
}) {
  const t = useT();
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {types.map((type) => (
        <label key={type.id} className="flex items-center gap-3 bg-surface px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium">{type.name}</span>
            <span className="block text-sm text-muted">
              {defaults[type.id] == null ? t("No default set") : t("Default {amount}", { amount: t.money(defaults[type.id]!, currency) })}
            </span>
          </span>
          <span className="relative w-32 shrink-0">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">₹</span>
            <input
              name={`fee_${type.id}`}
              inputMode="decimal"
              defaultValue={current[type.id] ?? ""}
              placeholder={defaults[type.id] == null ? "—" : String(defaults[type.id])}
              aria-label={t("{type} fee", { type: type.name })}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pr-3 pl-7 text-right text-lg font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </span>
        </label>
      ))}
    </div>
  );
}
