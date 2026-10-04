"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { fromOsm, INDIAN_STATES, type Address } from "@/lib/address";
import { countryOptions } from "@/lib/phone";
import { useT } from "@/i18n/client";

// The map library touches `window`, so it only loads in the browser, and only when opened.
const MapPicker = dynamic(() => import("./map-picker").then((m) => m.MapPicker), {
  ssr: false,
  loading: () => <p className="py-6 text-center text-sm text-muted">Loading map…</p>,
});

type Fields = Record<"address" | "address_line2" | "city" | "state" | "postal_code" | "address_country", string>;

/**
 * Address in parts — line 1, line 2, city, PIN code, state, country — with an
 * optional map pin (exact directions for home visits). Picking a spot on the
 * map fills in the parts it can; the physio checks and corrects them.
 */
export function AddressFields({ clinicCountry, defaults = {} }: { clinicCountry: string; defaults?: Partial<Address> }) {
  const [f, setF] = useState<Fields>({
    address: defaults.address ?? "",
    address_line2: defaults.address_line2 ?? "",
    city: defaults.city ?? "",
    state: defaults.state ?? "",
    postal_code: defaults.postal_code ?? "",
    address_country: defaults.address_country ?? clinicCountry,
  });
  const [pin, setPin] = useState(defaults.latitude != null && defaults.longitude != null ? { lat: defaults.latitude, lng: defaults.longitude } : null);
  const [mapOpen, setMapOpen] = useState(false);
  const [filled, setFilled] = useState(false);
  const t = useT();
  const countries = useMemo(() => countryOptions(clinicCountry, t.locale), [clinicCountry, t.locale]);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const indian = f.address_country === "IN";
  const states = f.state && !INDIAN_STATES.includes(f.state) ? [f.state, ...INDIAN_STATES] : INDIAN_STATES;

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-base font-medium">
        {t("Address")} <em className="text-sm font-normal text-muted">{t("(for home visits)")}</em>
      </legend>

      {mapOpen ? (
        <MapPicker
          start={pin}
          country={f.address_country}
          onClose={() => setMapOpen(false)}
          onPick={(lat, lng, osm) => {
            setPin({ lat, lng });
            setMapOpen(false);
            if (!osm) return;
            const got = fromOsm(osm);
            // Fill the parts the map knows. Lines the physio already typed are kept —
            // the map rarely knows the flat number.
            setF((x) => ({
              address: x.address || got.address || "",
              address_line2: x.address_line2 || got.address_line2 || "",
              city: got.city ?? x.city,
              state: got.state ?? x.state,
              postal_code: got.postal_code ?? x.postal_code,
              address_country: got.address_country ?? x.address_country,
            }));
            setFilled(true);
          }}
        />
      ) : pin ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ok-soft px-3 py-2 text-sm">
          <span className="font-medium text-ok">📍 {t("Pinned on the map")}</span>
          <a href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`} target="_blank" rel="noopener noreferrer" className="text-brand">
            {t("Check")}
          </a>
          <button type="button" onClick={() => setMapOpen(true)} className="text-brand">
            {t("Move")}
          </button>
          <button type="button" onClick={() => setPin(null)} className="text-muted">
            {t("Remove")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setMapOpen(true)} className="btn w-full">
          📍 {t("Pick on map")} <span className="font-normal text-muted">{t("(optional)")}</span>
        </button>
      )}
      <input type="hidden" name="latitude" value={pin?.lat ?? ""} />
      <input type="hidden" name="longitude" value={pin?.lng ?? ""} />
      {filled && <p className="text-sm text-muted">{t("Filled in from the map — please check, and add the house / flat number.")}</p>}

      <label className="field">
        <span>
          {t("Line 1")} <em>{t("(house / flat no., building, street)")}</em>
        </span>
        <input name="address" value={f.address} onChange={set("address")} autoComplete="off" placeholder={t("e.g. Flat 4B, Sea View Apts, 14th Road")} />
      </label>
      <label className="field">
        <span>
          {t("Line 2")} <em>{t("(area, landmark)")}</em>
        </span>
        <input
          name="address_line2"
          value={f.address_line2}
          onChange={set("address_line2")}
          autoComplete="off"
          placeholder={t("e.g. Khar West, near Jain temple")}
        />
      </label>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <label className="field">
          <span>{t("City / town")}</span>
          <input name="city" value={f.city} onChange={set("city")} autoComplete="off" />
        </label>
        <label className="field">
          <span>{indian ? t("PIN code") : t("Postal code")}</span>
          <input
            name="postal_code"
            value={f.postal_code}
            onChange={set("postal_code")}
            autoComplete="off"
            inputMode={indian ? "numeric" : "text"}
            maxLength={indian ? 7 : 10} // "400 050" is how many people write it
            pattern={indian ? "[1-9][0-9]{2} ?[0-9]{3}" : undefined}
            title={indian ? t("6 digits") : undefined}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>{t("State")}</span>
          {indian ? (
            <select name="state" value={f.state} onChange={set("state")}>
              <option value="">{t("Choose…")}</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          ) : (
            <input name="state" value={f.state} onChange={set("state")} autoComplete="off" />
          )}
        </label>
        <label className="field">
          <span>{t("Country")}</span>
          <select name="address_country" value={f.address_country} onChange={set("address_country")}>
            {countries.map((c) => (
              <option key={c.code} value={c.code} suppressHydrationWarning>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
