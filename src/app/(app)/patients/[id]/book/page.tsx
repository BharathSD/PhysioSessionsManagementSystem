import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { bookSession } from "../../../actions";

export const generateMetadata = titled(msg("Book session"));

export default async function BookSessionPage(props: PageProps<"/patients/[id]/book">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const { activeTypes } = await getBilling();

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}`, label: p.name }}
        title={t("Book a session")}
        subtitle={t("For an extra visit, a moved visit, or a patient without a regular schedule.")}
      />
      <ActionForm action={bookSession.bind(null, p.id)} submitLabel={t("Book session")} className="card space-y-5">
        <DateField name="scheduled_date" label={t("Session date")} today={today} min={today} shortcuts={["today", "tomorrow"]} required />
        <VisitTypePicker types={activeTypes} defaultValue={p.default_visit_type_id} />
        <DateField name="booked_on" label={t("Booked on")} today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} />
        <label className="field">
          <span>
            {t("Note")} <em>{t("(optional)")}</em>
          </span>
          <input name="note" placeholder={t("e.g. moved from Wednesday")} />
        </label>
      </ActionForm>
    </div>
  );
}
