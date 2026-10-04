import { TitlePicker } from "@/components/title-picker";
import { PATIENT_TITLES } from "@/lib/names";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { ClinicalFields, PatientDetailsFields } from "@/components/patient-details-fields";
import { PhoneField } from "@/components/phone-field";
import { PageHeader, SectionTitle } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { getTeam } from "@/lib/team";
import { PhysioPicker } from "@/components/physio-picker";
import { MessageLanguagePicker } from "@/components/message-language-picker";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { todayIn } from "@/lib/format";
import { DETAIL_COLUMNS, loadPatient } from "@/lib/patient";
import { setArchived, updatePatient } from "../../../actions";

export const generateMetadata = titled(msg("Edit patient"));

export default async function EditPatientPage(props: PageProps<"/patients/[id]/edit">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const [{ activeTypes }, { data: details }, team] = await Promise.all([
    getBilling(),
    ctx.supabase.from("patients").select(DETAIL_COLUMNS).eq("id", p.id).maybeSingle(),
    getTeam(),
  ]);

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}`, label: p.name }} title={t("Edit details")} />
      <ActionForm action={updatePatient.bind(null, p.id)} submitLabel={t("Save changes")} className="card space-y-5">
        <TitlePicker
          name="title"
          legend={
            <>
              {t("Title")} <em className="font-normal text-muted">{t("(optional)")}</em>
            </>
          }
          titles={PATIENT_TITLES}
          defaultValue={p.title}
        />
        <label className="field">
          <span>{t("Full name")}</span>
          <input name="name" required defaultValue={p.name} />
        </label>
        <PhoneField
          label={
            <span>
              {t("WhatsApp number")} <em>{t("(to send receipts)")}</em>
            </span>
          }
          clinicCountry={ctx.clinic.country}
          defaultPhone={p.phone}
        />
        <MessageLanguagePicker defaultValue={p.language} />
        <label className="field">
          <span>{t("Condition / diagnosis")}</span>
          <input name="condition" defaultValue={p.condition ?? ""} placeholder={t("e.g. Knee rehab")} />
        </label>
        <VisitTypePicker types={activeTypes} label={t("Usually seen as")} defaultValue={p.default_visit_type_id} />
        {team.isTeam && <PhysioPicker members={team.members} defaultValue={p.physio_id} allowNone />}
        <p className="text-sm text-muted">{t("To change what they pay, use Edit fees on the patient's page.")}</p>
        <div className="space-y-4 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">{t("Clinical")}</h2>
          <ClinicalFields today={todayIn(ctx.clinic.timezone)} defaults={details ?? {}} />
        </div>
        <div className="space-y-4 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">{t("Personal")}</h2>
          <PatientDetailsFields today={todayIn(ctx.clinic.timezone)} clinicCountry={ctx.clinic.country} defaults={details ?? {}} />
        </div>
      </ActionForm>

      <SectionTitle>{p.archived ? t("Restore") : t("Treatment finished?")}</SectionTitle>
      <div className="card space-y-3">
        <p className="text-base text-muted">
          {p.archived
            ? t("Bring this patient back to your active list.")
            : t("Archiving hides the patient from Today and your patient list. Nothing is deleted — you can restore them any time.")}
        </p>
        <form action={setArchived.bind(null, p.id, !p.archived)}>
          {p.archived ? (
            <ConfirmButton className="btn w-full text-base" confirmText={t("Tap again to restore")}>
              {t("Restore patient")}
            </ConfirmButton>
          ) : (
            <ConfirmButton className="btn w-full text-base text-muted" confirmText={t("Tap again to archive")}>
              <Icon name="archive" /> {t("Archive patient")}
            </ConfirmButton>
          )}
        </form>
      </div>
    </div>
  );
}
