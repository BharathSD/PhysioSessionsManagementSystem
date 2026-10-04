import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ChoiceWithAmount } from "@/components/choice-with-amount";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { PainPicker } from "@/components/pain";
import { PageHeader } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { feeFor } from "@/lib/fees";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { loadPatient } from "@/lib/patient";
import { STATUS } from "@/lib/status";
import type { Session, SessionStatus } from "@/lib/types";
import { removeVisit, updateSession } from "../../../../actions";

export const generateMetadata = titled(msg("Edit visit"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditVisitPage(props: PageProps<"/patients/[id]/visits/[sessionId]">) {
  const { id, sessionId } = await props.params;
  if (!UUID.test(sessionId)) notFound();
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { data } = await ctx.supabase.from("sessions").select("*").eq("id", sessionId).eq("patient_id", p.id).maybeSingle();
  if (!data) notFound();
  const s = data as Session;

  const today = todayIn(ctx.clinic.timezone);
  const [{ activeTypes, visitTypes, rates }, slots] = await Promise.all([getBilling(), packageSlots(ctx, p.id)]);
  const money = (n: number) => t.money(n, ctx.clinic.currency);
  const left = slots.reduce((n, sl) => n + Math.max(0, sl.remaining), 0);
  const fee = feeFor(rates, { patientId: p.id, kind: "visit", visitTypeId: s.visit_type_id, date: s.session_date });
  // Keep a hidden visit type selectable if this visit already uses it.
  const types = activeTypes.some((v) => v.id === s.visit_type_id) ? activeTypes : [...activeTypes, ...visitTypes.filter((v) => v.id === s.visit_type_id)];

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}?tab=visits`, label: p.name }} title={t("Edit visit")} subtitle={t.date(s.session_date)} />
      <ActionForm action={updateSession.bind(null, s.id)} submitLabel={t("Save changes")} className="card space-y-6">
        <DateField name="session_date" label={t("Date")} today={today} defaultValue={s.session_date} max={today} shortcuts={["today", "yesterday"]} required />

        <fieldset className="field">
          <legend className="mb-1.5">{t("What happened?")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS) as SessionStatus[]).map((k) => (
              <label
                key={k}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-3 text-center text-base font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg"
              >
                <input type="radio" name="status" value={k} defaultChecked={s.status === k} className="sr-only" />
                {t(STATUS[k].label)}
              </label>
            ))}
          </div>
        </fieldset>

        <VisitTypePicker types={types} defaultValue={s.visit_type_id} />

        <PainPicker defaultValue={s.pain_score} />

        <ChoiceWithAmount
          legend={t("How is it paid for?")}
          name="billing"
          amountName="charge"
          defaultValue={s.package_id ? "package" : Number(s.charge) > 0 ? "amount" : "none"}
          defaultAmount={Number(s.charge) > 0 ? Number(s.charge) : fee}
          options={[
            {
              value: "package",
              label: t("From package"),
              hint: s.package_id
                ? t("Uses one package session (already counted)")
                : left === 0
                  ? t("No package sessions left")
                  : left === 1
                    ? t("1 package session left")
                    : t("{n} package sessions left", { n: left }),
            },
            { value: "amount", label: t("Charge an amount"), hint: fee === null ? undefined : t("Fee on this date: {amount}", { amount: money(fee) }), withAmount: true },
            { value: "none", label: t("No charge"), hint: t("Free, or a clinic cancellation") },
          ]}
        />

        <label className="field">
          <span>
            {t("Note")} <em>{t("(optional)")}</em>
          </span>
          <input name="notes" defaultValue={s.notes ?? ""} />
        </label>
      </ActionForm>

      <form action={removeVisit.bind(null, s.id, p.id)} className="mt-4">
        <ConfirmButton className="btn w-full text-base text-muted" confirmText={t("Tap again to remove this visit")}>
          {t("Remove this visit")}
        </ConfirmButton>
      </form>
    </div>
  );
}
