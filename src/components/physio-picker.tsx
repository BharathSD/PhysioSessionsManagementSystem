"use client";

import { useT } from "@/i18n/client";
import { physioName } from "@/lib/names";
import type { TeamMember } from "@/lib/team";

/** Main physio for a patient. Only rendered in a clinic with more than one physio. */
export function PhysioPicker({ members, defaultValue, allowNone = false }: { members: TeamMember[]; defaultValue: string | null; allowNone?: boolean }) {
  const t = useT();
  return (
    <label className="field">
      <span>
        {t("Main physio")} <em>{t("(their patient under “My patients”)")}</em>
      </span>
      <select name="physio_id" defaultValue={defaultValue ?? ""}>
        {allowNone && <option value="">{t("No one in particular")}</option>}
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {physioName(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
