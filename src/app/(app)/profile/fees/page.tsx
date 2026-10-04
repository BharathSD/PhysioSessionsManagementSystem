import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { OwnerNote } from "@/components/owner-note";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { feeHistory, standardFee } from "@/lib/fees";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import type { Rate, RateKind } from "@/lib/types";
import { addVisitType, renameVisitType, setVisitTypeArchived } from "../../actions";

export const generateMetadata = titled(msg("Fees & visit types"));

export default async function FeesPage() {
  const ctx = await getContext();
  const t = await getT();
  const { visitTypes, rates } = await getBilling();
  const today = todayIn(ctx.clinic.timezone);
  const money = (n: number) => t.money(n, ctx.clinic.currency);
  const isOwner = ctx.member.role === "owner";

  const row = (href: string, title: string, kind: RateKind, typeId: string | null, hint?: string) => {
    const now = standardFee(rates, kind, typeId, today);
    const upcoming = feeHistory(rates, null, kind, typeId).filter((r: Rate) => r.effective_from > today).at(-1);
    return (
      <li key={href}>
        <Link href={href} className={`flex items-center gap-3 px-4 py-3.5 active:bg-surface-2 ${isOwner ? "" : "pointer-events-none"}`}>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{title}</span>
            {upcoming ? (
              <span className="block text-sm text-brand">
                {t("{amount} from {date}", { amount: money(Number(upcoming.amount)), date: t.date(upcoming.effective_from) })}
              </span>
            ) : (
              hint && <span className="block text-sm text-muted">{hint}</span>
            )}
          </span>
          <span className={`text-lg font-semibold ${now === null ? "text-warn" : ""}`}>{now === null ? t("Set fee") : money(now)}</span>
          {isOwner && <Icon name="chevron" className="size-5 text-muted" />}
        </Link>
      </li>
    );
  };

  const active = visitTypes.filter((v) => !v.archived);
  const hidden = visitTypes.filter((v) => v.archived);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: t("Profile") }}
        title={t("Fees & visit types")}
        subtitle={t("Your standard fees. When you mark attendance, the fee in force on that day is used and saved with the visit.")}
      />

      {!isOwner && <OwnerNote text={t("Only the clinic owner can change the clinic's fees and visit types. You can see them here.")} />}

      <SectionTitle>{t("Visit fees")}</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {active.map((v) => row(`/profile/fees/edit?kind=visit&type=${v.id}`, v.name, "visit", v.id))}
      </ul>
      <p className="mt-2 px-1 text-sm text-muted">
        {t("Need a different fee for one patient? Open the patient → Account → Fees for this patient.")}
      </p>

      <SectionTitle>{t("Missed & cancelled sessions")}</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {row("/profile/fees/edit?kind=no_show", t("No-show fee"), "no_show", null, t("Only when you choose to charge an absence"))}
        {row("/profile/fees/edit?kind=cancellation", t("Cancellation fee"), "cancellation", null, t("Only when you choose to charge a patient's cancellation"))}
      </ul>
      <p className="mt-2 px-1 text-sm text-muted">
        {t("For patients on a package, charging a no-show or cancellation uses up one package session instead of this fee.")}
      </p>

      <SectionTitle>{t("Visit types")}</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {active.map((v) => (
          <li key={v.id} className="px-4 py-2">
            {!isOwner ? (
              <p className="flex min-h-11 items-center font-medium">{v.name}</p>
            ) : (
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-sm text-brand">{t("Rename / hide")}</span>
                </summary>
                <div className="space-y-3 pt-2 pb-2">
                  <ActionForm action={renameVisitType.bind(null, v.id)} submitLabel={t("Rename")} className="space-y-3">
                    <label className="field">
                      <span>{t("Name")}</span>
                      <input name="name" defaultValue={v.original ?? v.name} required />
                    </label>
                  </ActionForm>
                  <form action={setVisitTypeArchived.bind(null, v.id, true)}>
                    <SubmitButton className="btn w-full text-muted">{t("Hide this visit type")}</SubmitButton>
                  </form>
                  <p className="text-sm text-muted">{t("Hidden types stay on past visits but can't be picked for new ones.")}</p>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <ActionForm action={addVisitType} submitLabel={t("Add visit type")} className="card mt-3 space-y-3">
          <label className="field">
            <span>{t("New visit type")}</span>
            <input name="name" placeholder={t("e.g. Group session, Hydrotherapy")} />
          </label>
        </ActionForm>
      )}

      {isOwner && hidden.length > 0 && (
        <>
          <SectionTitle>{t("Hidden")}</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {hidden.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted">{v.name}</span>
                <form action={setVisitTypeArchived.bind(null, v.id, false)}>
                  <SubmitButton className="btn min-h-10 text-sm">{t("Show again")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
