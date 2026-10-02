import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { feeHistory, standardFee } from "@/lib/fees";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import type { RateKind } from "@/lib/types";
import { deleteRate, setClinicFee } from "../../../actions";

export const metadata = { title: "Change fee" };

const KIND_TITLE: Record<RateKind, string> = { visit: "", no_show: "No-show fee", cancellation: "Cancellation fee" };

export default async function EditFeePage(props: PageProps<"/profile/fees/edit">) {
  const sp = await props.searchParams;
  const kind = firstParam(sp.kind) as RateKind;
  if (!(kind in KIND_TITLE)) notFound();

  const ctx = await getContext();
  const { visitTypes, rates } = await getBilling();
  const type = kind === "visit" ? visitTypes.find((t) => t.id === firstParam(sp.type)) : null;
  if (kind === "visit" && !type) notFound();

  const today = todayIn(ctx.clinic.timezone);
  const money = (n: number) => formatMoney(n, ctx.clinic.currency);
  const typeId = type?.id ?? null;
  const now = standardFee(rates, kind, typeId, today);
  const history = feeHistory(rates, null, kind, typeId);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile/fees", label: "Fees" }}
        title={type ? `${type.name} fee` : KIND_TITLE[kind]}
        subtitle={now === null ? "Not set yet." : `Now ${money(now)}.`}
      />
      <ActionForm action={setClinicFee} submitLabel="Save fee" className="card space-y-5">
        <input type="hidden" name="kind" value={kind} />
        {type && <input type="hidden" name="visit_type_id" value={type.id} />}
        <label className="field">
          <span>New fee</span>
          <input name="amount" inputMode="decimal" required autoFocus placeholder={now === null ? "e.g. 600" : String(now)} className="!text-2xl font-semibold" />
        </label>
        <DateField name="effective_from" label="Applies from" today={today} defaultValue={today} shortcuts={["today", "tomorrow"]} required />
        <p className="text-sm text-muted">
          Visits marked for this date onwards use the new fee. Visits already marked keep their price. You can pick a future date to
          schedule a price change.
        </p>
      </ActionForm>

      {history.length > 0 && (
        <>
          <SectionTitle>Price history</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="block font-medium">{money(Number(r.amount))}</span>
                  <span className="block text-sm text-muted">
                    from {formatDate(r.effective_from)}
                    {r.effective_from > today ? " (upcoming)" : ""}
                  </span>
                </span>
                <form action={deleteRate.bind(null, r.id)}>
                  <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Remove?">
                    Remove
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
