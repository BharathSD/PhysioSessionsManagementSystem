import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { addPackage } from "../../../actions";

export const metadata = { title: "New package" };

export default async function NewPackagePage(props: PageProps<"/patients/[id]/package">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);
  const { activeTypes } = await getBilling();

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=account`, label: p.name }}
        title="New package"
        subtitle="A block of sessions the patient pays for, e.g. 10 sessions for ₹5,000."
      />
      <ActionForm action={addPackage.bind(null, p.id)} submitLabel="Save package" className="card space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Number of sessions</span>
            <input name="sessions" type="number" inputMode="numeric" min={1} required autoFocus placeholder="e.g. 10" />
          </label>
          <label className="field">
            <span>Price</span>
            <input name="price" inputMode="decimal" placeholder="e.g. 5000" />
          </label>
        </div>
        <VisitTypePicker types={activeTypes} label="Sessions for" anyLabel="Any visit type" />
        <label className="field">
          <span>Name <em>(optional)</em></span>
          <input name="title" placeholder="e.g. Knee rehab – phase 2" />
        </label>
        <DateField name="start_date" label="Starts on" today={today} defaultValue={today} max={today} shortcuts={["today"]} />
        <details className="rounded-2xl bg-surface-2 p-3">
          <summary className="cursor-pointer text-base font-medium">Moving this from paper records?</summary>
          <label className="field mt-3">
            <span>
              Sessions already done <em>(no dates needed)</em>
            </span>
            <input name="used_before" type="number" inputMode="numeric" min={0} placeholder="0" />
          </label>
        </details>
      </ActionForm>
    </div>
  );
}
