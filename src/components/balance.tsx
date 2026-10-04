"use client";

import { useT } from "@/i18n/client";
import type { PatientSummary } from "@/lib/types";

/** "7/10 used" as a row of dots — readable at a glance by physio and patient. */
export function SessionDots({ used, total }: { used: number; total: number }) {
  const t = useT();
  if (total <= 0 || total > 30) return null;
  return (
    <div className="flex flex-wrap gap-1" aria-label={t("{used} of {total} sessions used", { used, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`size-2.5 rounded-full ${i < used ? "bg-brand" : "bg-surface-2 ring-1 ring-border"}`} />
      ))}
    </div>
  );
}

export function BalanceChips({ p, currency }: { p: PatientSummary; currency: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.sessions_bought === 0 ? (
        <span className="chip bg-surface-2 text-muted">{t("Pay per visit")}</span>
      ) : p.sessions_left > 1 ? (
        <span className="chip bg-brand-soft text-brand">{t("{n} sessions left", { n: p.sessions_left })}</span>
      ) : p.sessions_left === 1 ? (
        <span className="chip bg-warn-soft text-warn">{t("Last session")}</span>
      ) : (
        <span className="chip bg-warn-soft text-warn">{t("Package used up")}</span>
      )}
      {p.amount_due > 0 && <span className="chip bg-bad-soft text-bad">{t("{amount} due", { amount: t.money(p.amount_due, currency) })}</span>}
      {p.amount_due < 0 && <span className="chip bg-ok-soft text-ok">{t("{amount} advance", { amount: t.money(-p.amount_due, currency) })}</span>}
    </div>
  );
}
