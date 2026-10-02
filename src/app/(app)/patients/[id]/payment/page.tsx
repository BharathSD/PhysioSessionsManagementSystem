import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { MethodPicker } from "@/components/method-picker";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney, todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { recordPayment } from "../../../actions";

export const metadata = { title: "Record payment" };

export default async function RecordPaymentPage(props: PageProps<"/patients/[id]/payment">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=account`, label: p.name }}
        title="Record payment"
        subtitle={p.amount_due > 0 ? `${formatMoney(p.amount_due, ctx.clinic.currency)} is due` : "Nothing is due right now"}
      />
      <ActionForm action={recordPayment.bind(null, p.id)} submitLabel="Save payment" className="card space-y-5">
        <label className="field">
          <span>Amount received</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            autoFocus
            defaultValue={p.amount_due > 0 ? p.amount_due : undefined}
            className="!text-2xl font-semibold"
          />
        </label>
        <MethodPicker />
        <DateField name="paid_on" label="Paid on" today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} required />
        <label className="field">
          <span>Note <em>(optional)</em></span>
          <input name="note" placeholder="e.g. UPI reference, part payment" />
        </label>
      </ActionForm>
    </div>
  );
}
