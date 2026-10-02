import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { addCharge } from "../../../actions";

export const metadata = { title: "Charge or discount" };

export default async function ChargePage(props: PageProps<"/patients/[id]/charge">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=account`, label: p.name }}
        title="Charge or discount"
        subtitle="For anything that isn't a visit or package — equipment, reports, a discount or a write-off."
      />
      <ActionForm action={addCharge.bind(null, p.id)} submitLabel="Save" className="card space-y-5">
        <fieldset className="field">
          <legend className="mb-1.5">Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "charge", label: "Extra charge", hint: "Adds to what they owe" },
              { value: "discount", label: "Discount", hint: "Reduces what they owe" },
            ].map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer flex-col rounded-xl border border-border bg-surface px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
              >
                <input type="radio" name="kind" value={o.value} defaultChecked={o.value === "charge"} className="sr-only" />
                <span className="text-base font-medium">{o.label}</span>
                <span className="text-sm font-normal text-muted">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>What is it for?</span>
          <input name="description" required placeholder="e.g. Knee brace, Senior citizen discount" />
        </label>
        <label className="field">
          <span>Amount</span>
          <input name="amount" inputMode="decimal" required placeholder="e.g. 800" className="!text-2xl font-semibold" />
        </label>
        <DateField name="charge_date" label="Date" today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} required />
      </ActionForm>
    </div>
  );
}
