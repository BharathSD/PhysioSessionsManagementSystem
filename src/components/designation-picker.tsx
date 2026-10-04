"use client";

import { useT } from "@/i18n/client";
import { DESIGNATIONS } from "@/lib/names";
import { TitlePicker } from "./title-picker";

/** Dr. · Prof. · Mr. · Ms. · Mrs. · None, as tap-chips. Submits `designation`. */
export function DesignationPicker({ defaultValue = "Dr." }: { defaultValue?: string }) {
  const t = useT();
  return (
    <TitlePicker
      name="designation"
      titles={DESIGNATIONS}
      defaultValue={defaultValue}
      legend={
        <>
          {t("Title")} <em className="font-normal text-muted">{t("(shown before your name)")}</em>
        </>
      }
    />
  );
}
