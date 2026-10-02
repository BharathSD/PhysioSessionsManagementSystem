"use client";

import { useMemo, useState } from "react";
import { countryOptions, splitE164 } from "@/lib/phone";

/**
 * Country picker + number. Submits `phone_country` (e.g. "IN") and `phone`
 * (as typed); the server turns them into E.164.
 */
export function PhoneField({
  label,
  clinicCountry,
  defaultPhone = null,
}: {
  label: React.ReactNode;
  clinicCountry: string;
  defaultPhone?: string | null;
}) {
  const initial = splitE164(defaultPhone, clinicCountry);
  const [country, setCountry] = useState(initial.country);
  const options = useMemo(() => countryOptions(clinicCountry), [clinicCountry]);
  const selected = options.find((o) => o.code === country) ?? options[0];

  return (
    <div className="field">
      <label htmlFor="phone">{label}</label>
      <div className="flex gap-2">
        {/* Native select (searchable by typing, good on phones) behind a compact flag + code label. */}
        <div className="relative shrink-0">
          <div className="pointer-events-none flex h-full items-center gap-1 rounded-xl border border-border bg-surface px-3 text-base font-normal">
            <span aria-hidden>{selected.flag}</span>
            <span>{selected.dial}</span>
            <span className="text-xs text-muted" aria-hidden>
              ▾
            </span>
          </div>
          <select
            name="phone_country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country code"
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {options.map((o) => (
              <option key={o.code} value={o.code} suppressHydrationWarning>
                {o.flag} {o.name} ({o.dial})
              </option>
            ))}
          </select>
        </div>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={initial.national}
          placeholder={country === "IN" ? "98765 43210" : "Phone number"}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
