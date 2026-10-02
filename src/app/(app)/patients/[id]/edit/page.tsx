import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { PhoneField } from "@/components/phone-field";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import { loadPatient } from "@/lib/patient";
import { setArchived, updatePatient } from "../../../actions";

export const metadata = { title: "Edit patient" };

export default async function EditPatientPage(props: PageProps<"/patients/[id]/edit">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}`, label: p.name }} title="Edit details" />
      <ActionForm action={updatePatient.bind(null, p.id)} submitLabel="Save changes" className="card space-y-5">
        <label className="field">
          <span>Full name</span>
          <input name="name" required defaultValue={p.name} />
        </label>
        <PhoneField label={<span>WhatsApp number <em>(to send receipts)</em></span>} clinicCountry={ctx.clinic.country} defaultPhone={p.phone} />
        <label className="field">
          <span>Condition</span>
          <input name="condition" defaultValue={p.condition ?? ""} placeholder="e.g. Knee rehab" />
        </label>
        <label className="field">
          <span>
            Fee per visit <em>(for visits without a package)</em>
          </span>
          <input name="rate_per_session" inputMode="decimal" defaultValue={p.rate_per_session ?? ""} placeholder="e.g. 600" />
        </label>
      </ActionForm>

      <SectionTitle>{p.archived ? "Restore" : "Treatment finished?"}</SectionTitle>
      <div className="card space-y-3">
        <p className="text-base text-muted">
          {p.archived
            ? "Bring this patient back to your active list."
            : "Archiving hides the patient from Today and your patient list. Nothing is deleted — you can restore them any time."}
        </p>
        <form action={setArchived.bind(null, p.id, !p.archived)}>
          {p.archived ? (
            <ConfirmButton className="btn w-full text-base" confirmText="Tap again to restore">
              Restore patient
            </ConfirmButton>
          ) : (
            <ConfirmButton className="btn w-full text-base text-muted" confirmText="Tap again to archive">
              <Icon name="archive" /> Archive patient
            </ConfirmButton>
          )}
        </form>
      </div>
    </div>
  );
}
