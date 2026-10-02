import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { FeeInputs } from "@/components/fee-inputs";
import { Icon } from "@/components/icons";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { feeFor, feeTimeline, standardFee } from "@/lib/fees";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { STATUS } from "@/lib/status";
import type { Session } from "@/lib/types";
import { deleteRate, setPatientFees } from "../../../actions";

export const metadata = { title: "Patient fees" };

export default async function PatientFeesPage(props: PageProps<"/patients/[id]/fees">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);
  const [{ activeTypes, rates, typeName }, { data: sessions }] = await Promise.all([
    getBilling(),
    ctx.supabase
      .from("sessions")
      .select("id, session_date, status, visit_type_id, package_id, charge")
      .eq("patient_id", p.id)
      .order("session_date", { ascending: false })
      .limit(30),
  ]);
  const money = (n: number) => formatMoney(n, ctx.clinic.currency);

  const current = Object.fromEntries(activeTypes.map((t) => [t.id, feeFor(rates, { patientId: p.id, kind: "visit", visitTypeId: t.id, date: today })]));
  const defaults = Object.fromEntries(activeTypes.map((t) => [t.id, standardFee(rates, "visit", t.id, today)]));
  const charged = ((sessions ?? []) as Pick<Session, "id" | "session_date" | "status" | "visit_type_id" | "package_id" | "charge">[]).filter(
    (s) => s.package_id || Number(s.charge) > 0,
  );

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}`, label: p.name }}
        title="Fees"
        subtitle={`What ${p.name} pays per visit. Changes apply from the date you pick — visits already marked keep their price.`}
      />

      <ActionForm action={setPatientFees.bind(null, p.id)} submitLabel="Save fees" className="space-y-4">
        <FeeInputs types={activeTypes} current={current} defaults={defaults} currency={ctx.clinic.currency} />
        <p className="px-1 text-sm text-muted">
          Keep the default amount (or clear the box) to stay on your default fee — the patient then follows any future change to it.
        </p>
        <div className="card">
          <DateField name="effective_from" label="New fees apply from" today={today} defaultValue={today} shortcuts={["today", "tomorrow"]} required />
        </div>
      </ActionForm>

      <SectionTitle>Fee history</SectionTitle>
      <div className="space-y-2.5">
        {activeTypes.map((t) => {
          const steps = feeTimeline(rates, p.id, t.id).reverse();
          const inForce = steps.find((s) => s.from <= today)?.from;
          return (
            <div key={t.id} className="card">
              <p className="mb-2 font-medium">{t.name}</p>
              {steps.length === 0 ? (
                <p className="text-sm text-muted">No fee set yet.</p>
              ) : (
                <ol className="space-y-2">
                  {steps.map((s) => {
                    const own = rates.find((r) => r.patient_id === p.id && r.visit_type_id === t.id && r.effective_from === s.from);
                    return (
                      <li key={s.from} className="flex items-center gap-3 text-base">
                        <span className={`size-2.5 shrink-0 rounded-full ${s.from === inForce ? "bg-brand" : "bg-border"}`} />
                        <span className="w-20 shrink-0 font-semibold">{s.amount === null ? "—" : money(s.amount)}</span>
                        <span className="min-w-0 flex-1 text-sm text-muted">
                          {s.source === "custom" ? "Own fee" : "Default"} · from {formatDate(s.from)}
                          {s.from > today ? " (upcoming)" : ""}
                        </span>
                        {own && (
                          <form action={deleteRate.bind(null, own.id)}>
                            <ConfirmButton className="text-xs text-muted underline" confirmText="Undo this change?">
                              Undo
                            </ConfirmButton>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <SectionTitle aside="Price saved with each visit">What was charged</SectionTitle>
      {charged.length === 0 ? (
        <p className="card text-base text-muted">No charged visits yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {charged.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-24 shrink-0 text-sm text-muted">{formatDate(s.session_date)}</span>
              <span className="min-w-0 flex-1 text-sm">
                {typeName(s.visit_type_id)}
                {s.status !== "attended" && <span className="text-muted"> · {STATUS[s.status].label}</span>}
              </span>
              <span className="font-semibold">{s.package_id ? <span className="text-sm font-normal text-muted">Package</span> : money(s.charge)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/patients/${p.id}?tab=account`} className="mt-3 flex min-h-11 items-center justify-center gap-1 text-base font-medium text-brand">
        Full statement with payments <Icon name="chevron" className="size-4" />
      </Link>
    </div>
  );
}
