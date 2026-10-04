"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { DateField } from "./date-field";
import { METHODS } from "./method-picker";

/** Several past payments, each with its own date. Submits pay_amount[], pay_method[], pay_date[] in matching order. */
export function PaymentRows({ today }: { today: string }) {
  const [rows, setRows] = useState([0]);
  const [nextKey, setNextKey] = useState(1);
  const t = useT();

  return (
    <div className="space-y-3">
      {rows.map((key, i) => (
        <div key={key} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("Payment {n}", { n: i + 1 })}</span>
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((r) => r.filter((k) => k !== key))} className="text-xs text-muted underline">
                {t("remove")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>{t("Amount")}</span>
              <input name="pay_amount" inputMode="decimal" placeholder="0" />
            </label>
            <label className="field">
              <span>{t("Via")}</span>
              <select name="pay_method" defaultValue="upi">
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DateField name="pay_date" label={t("Paid on")} today={today} max={today} shortcuts={["today", "yesterday"]} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setRows((r) => [...r, nextKey]);
          setNextKey((k) => k + 1);
        }}
        className="btn w-full"
      >
        {t("+ Add another payment")}
      </button>
    </div>
  );
}
