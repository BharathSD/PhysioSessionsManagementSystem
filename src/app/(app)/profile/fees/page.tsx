import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { feeHistory, standardFee } from "@/lib/fees";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import type { Rate, RateKind } from "@/lib/types";
import { addVisitType, renameVisitType, setVisitTypeArchived } from "../../actions";

export const metadata = { title: "Fees & visit types" };

export default async function FeesPage() {
  const ctx = await getContext();
  const { visitTypes, rates } = await getBilling();
  const today = todayIn(ctx.clinic.timezone);
  const money = (n: number) => formatMoney(n, ctx.clinic.currency);

  const row = (href: string, title: string, kind: RateKind, typeId: string | null, hint?: string) => {
    const now = standardFee(rates, kind, typeId, today);
    const upcoming = feeHistory(rates, null, kind, typeId).filter((r: Rate) => r.effective_from > today).at(-1);
    return (
      <li key={href}>
        <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{title}</span>
            {upcoming ? (
              <span className="block text-sm text-brand">
                {money(Number(upcoming.amount))} from {formatDate(upcoming.effective_from)}
              </span>
            ) : (
              hint && <span className="block text-sm text-muted">{hint}</span>
            )}
          </span>
          <span className={`text-lg font-semibold ${now === null ? "text-warn" : ""}`}>{now === null ? "Set fee" : money(now)}</span>
          <Icon name="chevron" className="size-5 text-muted" />
        </Link>
      </li>
    );
  };

  const active = visitTypes.filter((t) => !t.archived);
  const hidden = visitTypes.filter((t) => t.archived);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: "Profile" }}
        title="Fees & visit types"
        subtitle="Your standard fees. When you mark attendance, the fee in force on that day is used and saved with the visit."
      />

      <SectionTitle>Visit fees</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {active.map((t) => row(`/profile/fees/edit?kind=visit&type=${t.id}`, t.name, "visit", t.id))}
      </ul>
      <p className="mt-2 px-1 text-sm text-muted">
        Need a different fee for one patient? Open the patient → Account → Fees for this patient.
      </p>

      <SectionTitle>Missed & cancelled sessions</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {row("/profile/fees/edit?kind=no_show", "No-show fee", "no_show", null, "Only when you choose to charge an absence")}
        {row("/profile/fees/edit?kind=cancellation", "Cancellation fee", "cancellation", null, "Only when you choose to charge a patient's cancellation")}
      </ul>
      <p className="mt-2 px-1 text-sm text-muted">
        For patients on a package, charging a no-show or cancellation uses up one package session instead of this fee.
      </p>

      <SectionTitle>Visit types</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {active.map((t) => (
          <li key={t.id} className="px-4 py-2">
            <details>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-brand">Rename / hide</span>
              </summary>
              <div className="space-y-3 pt-2 pb-2">
                <ActionForm action={renameVisitType.bind(null, t.id)} submitLabel="Rename" className="space-y-3">
                  <label className="field">
                    <span>Name</span>
                    <input name="name" defaultValue={t.name} required />
                  </label>
                </ActionForm>
                <form action={setVisitTypeArchived.bind(null, t.id, true)}>
                  <SubmitButton className="btn w-full text-muted">Hide this visit type</SubmitButton>
                </form>
                <p className="text-sm text-muted">Hidden types stay on past visits but can&apos;t be picked for new ones.</p>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <ActionForm action={addVisitType} submitLabel="Add visit type" className="card mt-3 space-y-3">
        <label className="field">
          <span>New visit type</span>
          <input name="name" placeholder="e.g. Group session, Hydrotherapy" />
        </label>
      </ActionForm>

      {hidden.length > 0 && (
        <>
          <SectionTitle>Hidden</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {hidden.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted">{t.name}</span>
                <form action={setVisitTypeArchived.bind(null, t.id, false)}>
                  <SubmitButton className="btn min-h-10 text-sm">Show again</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
