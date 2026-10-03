import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { ClinicalFields, PatientDetailsFields } from "@/components/patient-details-fields";
import { PhoneField } from "@/components/phone-field";
import { PageHeader, SectionTitle } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { setArchived, updatePatient } from "../../../actions";

export const metadata = { title: "Edit patient" };

export default async function EditPatientPage(props: PageProps<"/patients/[id]/edit">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const [{ activeTypes }, { data: details }] = await Promise.all([
    getBilling(),
    ctx.supabase.from("patients").select("date_of_birth, dob_is_estimate, gender, address, emergency_name, emergency_phone, referred_by, injury_date, goals, precautions").eq("id", p.id).maybeSingle(),
  ]);

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
          <span>Condition / diagnosis</span>
          <input name="condition" defaultValue={p.condition ?? ""} placeholder="e.g. Knee rehab" />
        </label>
        <VisitTypePicker types={activeTypes} label="Usually seen as" defaultValue={p.default_visit_type_id} />
        <p className="text-sm text-muted">To change what they pay, use Edit fees on the patient&apos;s page.</p>
        <div className="space-y-4 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">Clinical</h2>
          <ClinicalFields today={todayIn(ctx.clinic.timezone)} defaults={details ?? {}} />
        </div>
        <div className="space-y-4 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">Personal</h2>
          <PatientDetailsFields today={todayIn(ctx.clinic.timezone)} clinicCountry={ctx.clinic.country} defaults={details ?? {}} />
        </div>
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
