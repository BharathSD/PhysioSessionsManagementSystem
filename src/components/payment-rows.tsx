"use client";

import { useState } from "react";
import { DateField } from "./date-field";

/** Several past payments, each with its own date. Submits pay_amount[], pay_method[], pay_date[] in matching order. */
export function PaymentRows({ today }: { today: string }) {
  const [rows, setRows] = useState([0]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="space-y-3">
      {rows.map((key, i) => (
        <div key={key} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Payment {i + 1}</span>
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((r) => r.filter((k) => k !== key))} className="text-xs text-muted underline">
                remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Amount</span>
              <input name="pay_amount" inputMode="decimal" placeholder="0" />
            </label>
            <label className="field">
              <span>Via</span>
              <select name="pay_method" defaultValue="upi">
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <DateField name="pay_date" label="Paid on" today={today} max={today} shortcuts={["today", "yesterday"]} />
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
        + Add another payment
      </button>
    </div>
  );
}
