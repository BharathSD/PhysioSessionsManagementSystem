import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { feeFor } from "@/lib/fees";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { loadPatient } from "@/lib/patient";
import { planOn, planVisitType, type Plan } from "@/lib/schedule";
import { STATUS } from "@/lib/status";
import { recordAttendance } from "../../../actions";
import { AttendanceForm } from "./attendance-form";

export const generateMetadata = titled(msg("Attendance"));

export default async function AttendancePage(props: PageProps<"/patients/[id]/attendance">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const requested = firstParam(sp.date);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;

  const [{ activeTypes, rates, typeName }, slots, { data: existing }, { data: plans }, { data: booking }] = await Promise.all([
    getBilling(),
    packageSlots(ctx, p.id),
    ctx.supabase.from("sessions").select("status, visit_type_id").eq("patient_id", p.id).eq("session_date", date).maybeSingle(),
    ctx.supabase.from("schedules").select("*").eq("patient_id", p.id),
    ctx.supabase.from("appointments").select("visit_type_id").eq("patient_id", p.id).eq("scheduled_date", date).eq("status", "booked").maybeSingle(),
  ]);

  const plan = planOn((plans ?? []) as Plan[], date);
  const defaultType = booking?.visit_type_id ?? (plan && planVisitType(plan, date)) ?? p.default_visit_type_id ?? activeTypes[0]?.id ?? null;
  const money = (n: number) => t.money(n, ctx.clinic.currency);
  const hasPackageSession = slots.some((s) => s.remaining > 0);
  const hint = (kind: "no_show" | "cancellation") => {
    if (hasPackageSession) return t("Uses up 1 package session");
    const fee = feeFor(rates, { patientId: p.id, kind, visitTypeId: null, date });
    return fee === null ? null : t("{amount} fee", { amount: money(fee) });
  };
  const back = { href: `/patients/${p.id}`, label: p.name };

  if (existing) {
    const s = STATUS[existing.status as keyof typeof STATUS];
    return (
      <div>
        <PageHeader back={back} title={t("Attendance")} subtitle={t.date(date)} />
        <div className="card space-y-3 text-base">
          <p>{t("Already marked {status} ({type}).", { status: t(s.label), type: typeName(existing.visit_type_id) })}</p>
          <p className="text-muted">{t("To change it, remove it from the patient's Visits tab first, then mark it again.")}</p>
          <Link href={`/patients/${p.id}?tab=visits`} className="btn w-full">
            {t("Go to Visits")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader back={back} title={t("Attendance")} subtitle={`${p.name} · ${date === today ? `${t("Today")}, ` : ""}${t.date(date)}`} />
      <AttendanceForm
        action={recordAttendance.bind(null, p.id, date)}
        types={activeTypes}
        defaultType={defaultType}
        today={today}
        date={date}
        chargeHint={{ missed: hint("no_show"), cancelled_patient: hint("cancellation") }}
      />
    </div>
  );
}
