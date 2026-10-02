import { formatMoney } from "@/lib/format";
import type { PatientSummary } from "@/lib/types";

/** "7/10 used" as a row of dots — readable at a glance by physio and patient. */
export function SessionDots({ used, total }: { used: number; total: number }) {
  if (total <= 0 || total > 30) return null;
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${used} of ${total} sessions used`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`size-2.5 rounded-full ${i < used ? "bg-brand" : "bg-surface-2 ring-1 ring-border"}`} />
      ))}
    </div>
  );
}

export function BalanceChips({ p, currency }: { p: PatientSummary; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.sessions_bought === 0 ? (
        <span className="chip bg-surface-2 text-muted">Pay per visit</span>
      ) : p.sessions_left > 1 ? (
        <span className="chip bg-brand-soft text-brand">{p.sessions_left} sessions left</span>
      ) : p.sessions_left === 1 ? (
        <span className="chip bg-warn-soft text-warn">Last session</span>
      ) : (
        <span className="chip bg-warn-soft text-warn">Package used up</span>
      )}
      {p.amount_due > 0 && <span className="chip bg-bad-soft text-bad">{formatMoney(p.amount_due, currency)} due</span>}
      {p.amount_due < 0 && <span className="chip bg-ok-soft text-ok">{formatMoney(-p.amount_due, currency)} advance</span>}
    </div>
  );
}
