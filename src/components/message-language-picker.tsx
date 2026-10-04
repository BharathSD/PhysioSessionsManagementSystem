"use client";

import { LOCALES, type Locale } from "@/i18n";
import { useT } from "@/i18n/client";
import { CHIP } from "./chip";

/** Language of a patient's WhatsApp messages, each option in its own language. Submits `language`. */
export function MessageLanguagePicker({ defaultValue }: { defaultValue?: string | null }) {
  const t = useT();
  const selected = defaultValue ?? t.locale;
  return (
    <fieldset>
      <legend className="mb-1.5 text-base font-medium">{t("WhatsApp messages in")}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LOCALES) as Locale[]).map((code) => (
          <label key={code} className={CHIP} lang={code}>
            <input type="radio" name="language" value={code} defaultChecked={selected === code} className="sr-only" />
            {LOCALES[code]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
