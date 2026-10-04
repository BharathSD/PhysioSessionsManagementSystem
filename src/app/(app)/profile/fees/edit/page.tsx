import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { feeHistory, standardFee } from "@/lib/fees";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import type { RateKind } from "@/lib/types";
import { deleteRate, setClinicFee } from "../../../actions";

export const generateMetadata = titled(msg("Change fee"));

const KIND_TITLE: Record<RateKind, string> = { visit: "", no_show: msg("No-show fee"), cancellation: msg("Cancellation fee") };

export default async function EditFeePage(props: PageProps<"/profile/fees/edit">) {
  const sp = await props.searchParams;
  const kind = firstParam(sp.kind) as RateKind;
  if (!(kind in KIND_TITLE)) notFound();

  const ctx = await getContext();
  if (ctx.member.role !== "owner") redirect("/profile/fees");
  const t = await getT();
  const { visitTypes, rates } = await getBilling();
  const type = kind === "visit" ? visitTypes.find((v) => v.id === firstParam(sp.type)) : null;
  if (kind === "visit" && !type) notFound();

  const today = todayIn(ctx.clinic.timezone);
  const money = (n: number) => t.money(n, ctx.clinic.currency);
  const typeId = type?.id ?? null;
  const now = standardFee(rates, kind, typeId, today);
  const history = feeHistory(rates, null, kind, typeId);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile/fees", label: t("Fees") }}
        title={type ? t("{type} fee", { type: type.name }) : t(KIND_TITLE[kind])}
        subtitle={now === null ? t("Not set yet.") : t("Now {amount}.", { amount: money(now) })}
      />
      <ActionForm action={setClinicFee} submitLabel={t("Save fee")} className="card space-y-5">
        <input type="hidden" name="kind" value={kind} />
        {type && <input type="hidden" name="visit_type_id" value={type.id} />}
        <label className="field">
          <span>{t("New fee")}</span>
          <input name="amount" inputMode="decimal" required autoFocus placeholder={now === null ? t("e.g. 600") : String(now)} className="!text-2xl font-semibold" />
        </label>
        <DateField name="effective_from" label={t("Applies from")} today={today} defaultValue={today} shortcuts={["today", "tomorrow"]} required />
        <p className="text-sm text-muted">
          {t("Visits marked for this date onwards use the new fee. Visits already marked keep their price. You can pick a future date to schedule a price change.")}
        </p>
      </ActionForm>

      {history.length > 0 && (
        <>
          <SectionTitle>{t("Price history")}</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="block font-medium">{money(Number(r.amount))}</span>
                  <span className="block text-sm text-muted">
                    {t("from {date}", { date: t.date(r.effective_from) })}
                    {r.effective_from > today ? ` ${t("(upcoming)")}` : ""}
                  </span>
                </span>
                <form action={deleteRate.bind(null, r.id)}>
                  <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText={t("Remove?")}>
                    {t("Remove")}
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
