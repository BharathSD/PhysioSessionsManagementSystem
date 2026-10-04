"use client";

import { setSessionCharged } from "@/app/(app)/actions";
import { useT } from "@/i18n/client";
import { CHARGEABLE } from "@/lib/status";
import type { Session } from "@/lib/types";
import { SubmitButton } from "./submit-button";

/**
 * What a marked visit costs, e.g. "Home visit · ₹1,000" or "In-clinic · from package".
 * For an absence or patient cancellation, offers "Charge fee" / "Don't charge".
 */
export function VisitCost({
  session,
  typeName,
  currency,
  canCharge,
}: {
  session: Pick<Session, "id" | "status" | "package_id" | "charge">;
  typeName: string;
  currency: string;
  canCharge: boolean;
}) {
  const t = useT();
  const charged = Boolean(session.package_id) || Number(session.charge) > 0;
  const cost = session.package_id ? t("from package") : Number(session.charge) > 0 ? t.money(session.charge, currency) : null;
  const chargeable = CHARGEABLE.includes(session.status);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <span>
        {typeName}
        {cost ? ` · ${cost}` : session.status === "attended" ? ` · ${t("no fee set")}` : chargeable ? ` · ${t("not charged")}` : ""}
      </span>
      {chargeable && (charged || canCharge) && (
        <form action={setSessionCharged.bind(null, session.id, !charged)}>
          <SubmitButton className="rounded-lg px-2 py-1 text-sm font-medium text-brand underline underline-offset-2" pendingText="…">
            {charged ? t("Don't charge") : t("Charge fee")}
          </SubmitButton>
        </form>
      )}
    </span>
  );
}
