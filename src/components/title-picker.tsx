"use client";

import { useT } from "@/i18n/client";
import { CHIP } from "./chip";

/** One-of title chips plus "None". Submits `name`. */
export function TitlePicker({
  name,
  legend,
  titles,
  defaultValue = "",
}: {
  name: string;
  legend: React.ReactNode;
  titles: readonly string[];
  defaultValue?: string;
}) {
  const t = useT();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[...titles, ""].map((title) => (
          <label key={title || "none"} className={CHIP}>
            <input type="radio" name={name} value={title} defaultChecked={defaultValue === title} className="sr-only" />
            {title || t("None")}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
