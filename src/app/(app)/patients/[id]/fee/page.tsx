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
import { loadPatient } from "@/lib/patient";
import { deleteRate, setPatientFee } from "../../../actions";

export const metadata = { title: "Patient fee" };

export default async function PatientFeePage(props: PageProps<"/patients/[id]/fee">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const { visitTypes, rates } = await getBilling();
  const type = visitTypes.find((t) => t.id === firstParam(sp.type));
  if (!type) notFound();

  const today = todayIn(ctx.clinic.timezone);
  const money = (n: number) => formatMoney(n, ctx.clinic.currency);
  const std = standardFee(rates, "visit", type.id, today);
  const history = feeHistory(rates, p.id, "visit", type.id);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=account`, label: p.name }}
        title={`${type.name} fee`}
        subtitle={`Standard fee: ${std === null ? "not set" : money(std)}. Set a different fee just for ${p.name}.`}
      />
      <ActionForm action={setPatientFee.bind(null, p.id)} submitLabel="Save fee" className="card space-y-5">
        <input type="hidden" name="kind" value="visit" />
        <input type="hidden" name="visit_type_id" value={type.id} />
        <label className="field">
          <span>Fee for {p.name}</span>
          <input name="amount" inputMode="decimal" placeholder={std === null ? "e.g. 500" : String(std)} className="!text-2xl font-semibold" />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-3">
          <input type="checkbox" name="use_standard" className="mt-1 size-5 accent-[var(--brand)]" />
          <span>
            <span className="block text-base font-medium">Use the standard fee instead</span>
            <span className="block text-sm text-muted">Removes the custom fee from the date below.</span>
          </span>
        </label>
        <DateField name="effective_from" label="Applies from" today={today} defaultValue={today} shortcuts={["today"]} required />
        <p className="text-sm text-muted">Visits before this date keep the price they were charged.</p>
      </ActionForm>

      {history.length > 0 && (
        <>
          <SectionTitle>History</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="block font-medium">{r.amount === null ? "Standard fee" : money(r.amount)}</span>
                  <span className="block text-sm text-muted">from {formatDate(r.effective_from)}</span>
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
