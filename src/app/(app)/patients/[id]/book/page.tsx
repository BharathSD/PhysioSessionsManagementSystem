import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { bookSession } from "../../../actions";

export const metadata = { title: "Book session" };

export default async function BookSessionPage(props: PageProps<"/patients/[id]/book">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}`, label: p.name }}
        title="Book a session"
        subtitle="For an extra visit, a moved visit, or a patient without a regular schedule."
      />
      <ActionForm action={bookSession.bind(null, p.id)} submitLabel="Book session" className="card space-y-5">
        <DateField name="scheduled_date" label="Session date" today={today} min={today} shortcuts={["today", "tomorrow"]} required />
        <DateField name="booked_on" label="Booked on" today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} />
        <label className="field">
          <span>Note <em>(optional)</em></span>
          <input name="note" placeholder="e.g. moved from Wednesday" />
        </label>
      </ActionForm>
    </div>
  );
}
