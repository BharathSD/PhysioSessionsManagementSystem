import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { loadPatient } from "@/lib/patient";
import { saveSessionRecord } from "../../../../../actions";
import { RecordForm, type RecordItem } from "./record-form";

export const generateMetadata = titled(msg("Session record"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionRecordPage(props: PageProps<"/patients/[id]/visits/[sessionId]/record">) {
  const { id, sessionId } = await props.params;
  if (!UUID.test(sessionId)) notFound();
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { supabase } = ctx;
  const { data: s } = await supabase.from("sessions").select("id, session_date, visit_type_id, notes, case_id").eq("id", sessionId).eq("patient_id", p.id).maybeSingle();
  if (!s) notFound();

  const [{ typeName }, { data: library }, { data: items }, { data: previous }, { data: cases }] = await Promise.all([
    getBilling(),
    supabase.from("exercise_library").select("kind, name, dosage").eq("archived", false).order("name"),
    supabase.from("session_items").select("kind, name, dosage").eq("session_id", s.id).order("sort"),
    // The most recent earlier visit with something recorded, for "Same as last time".
    supabase
      .from("sessions")
      .select("id, session_items(kind, name, dosage, sort)")
      .eq("patient_id", p.id)
      .lt("session_date", s.session_date)
      .order("session_date", { ascending: false })
      .limit(10),
    supabase.from("cases").select("id, title, status").eq("patient_id", p.id).order("opened_on", { ascending: false }),
  ]);
  const last = (previous ?? []).find((v) => (v.session_items as unknown[]).length > 0);
  const lastTime = last
    ? (last.session_items as (RecordItem & { sort: number })[]).sort((a, b) => a.sort - b.sort).map(({ kind, name, dosage }) => ({ kind, name, dosage }))
    : [];
  // Active cases, plus the one this visit is already filed under.
  const choices = (cases ?? []).filter((c) => c.status === "active" || c.id === s.case_id).map((c) => ({ id: c.id as string, title: c.title as string }));

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=visits`, label: p.name }}
        title={t("Session record")}
        subtitle={`${t.date(s.session_date)} · ${typeName(s.visit_type_id)}`}
      />
      <RecordForm
        action={saveSessionRecord.bind(null, s.id)}
        library={(library ?? []) as RecordItem[]}
        initial={(items ?? []) as RecordItem[]}
        lastTime={lastTime}
        notes={s.notes ?? ""}
        cases={choices}
        caseId={s.case_id}
      />
    </div>
  );
}
