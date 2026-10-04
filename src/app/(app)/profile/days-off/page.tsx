import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { OwnerNote } from "@/components/owner-note";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { Icon } from "@/components/icons";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import type { DayOff } from "@/lib/days-off";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { WEEKDAYS } from "@/lib/schedule";
import { CHIP } from "@/components/chip";
import { addClinicDaysOff, removeDayOff, setClosedWeekdays } from "../../actions";

export const generateMetadata = titled(msg("Days off"));

export default async function DaysOffPage() {
  const { supabase, clinic, member } = await getContext();
  const t = await getT();
  const isOwner = member.role === "owner";
  const today = todayIn(clinic.timezone);
  const [{ data }, { data: notices }] = await Promise.all([
    supabase.from("days_off").select("*").is("patient_id", null).order("from_date"),
    supabase.from("day_off_notices").select("day_off_id"),
  ]);
  const closures = (data ?? []) as DayOff[];
  const told = new Map<string, number>();
  for (const n of notices ?? []) told.set(n.day_off_id, (told.get(n.day_off_id) ?? 0) + 1);
  const upcoming = closures.filter((c) => c.to_date >= today);
  const past = closures.filter((c) => c.to_date < today).reverse().slice(0, 10);
  const when = (c: DayOff) => (c.from_date === c.to_date ? t.day(c.from_date) : `${t.day(c.from_date)} – ${t.day(c.to_date)}`);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: t("Profile") }}
        title={t("Days off")}
        subtitle={t("Clinic closed or you're away? Add the days — everyone's sessions on them are cancelled (no charge) and you can tell patients on WhatsApp.")}
      />

      {!isOwner && <OwnerNote text={t("Only the clinic owner can change the clinic's days off. You can still notify patients.")} />}

      {/* Regular weekly closing, e.g. every Sunday: nobody is expected and no attendance is asked for. */}
      <SectionTitle>{t("Closed every week")}</SectionTitle>
      {isOwner ? (
        <ActionForm action={setClosedWeekdays} submitLabel={t("Save")} className="card space-y-3">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <label key={w.n} className={CHIP}>
                <input
                  type="checkbox"
                  name="closed_weekdays"
                  value={w.n}
                  defaultChecked={clinic.closed_weekdays?.includes(w.n)}
                  className="sr-only"
                />
                {t.weekday(w.n)}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted">{t("On these days nobody is expected and no attendance is asked for. Packages last longer instead.")}</p>
        </ActionForm>
      ) : (
        <p className="card text-base">
          {clinic.closed_weekdays?.length ? clinic.closed_weekdays.map((d) => t.weekday(d)).join(", ") : t("Open every day")}
        </p>
      )}

      <SectionTitle>{t("Other days off")}</SectionTitle>
      {isOwner && (
        <ActionForm action={addClinicDaysOff} submitLabel={t("Save and notify patients")} className="card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField name="from_date" label={t("First day off")} today={today} min={today} shortcuts={["today", "tomorrow"]} required />
            <DateField
              name="to_date"
              label={
                <span>
                  {t("Last day off")} <em>{t("(same day if just one)")}</em>
                </span>
              }
              today={today}
              min={today}
              shortcuts={[]}
            />
          </div>
          <label className="field">
            <span>
              {t("Reason")} <em>{t("(optional — shown in the message)")}</em>
            </span>
            <input name="reason" placeholder={t("e.g. Diwali, conference in Pune, family function")} />
          </label>
        </ActionForm>
      )}

      <SectionTitle>{t("Coming up")}</SectionTitle>
      {upcoming.length === 0 ? (
        <p className="card text-base text-muted">{t("No days off planned.")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {upcoming.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{when(c)}</span>
                <span className="block text-sm text-muted">
                  {c.reason ?? t("Clinic closed")} ·{" "}
                  {told.get(c.id) === 1 ? t("1 patient told") : t("{n} patients told", { n: told.get(c.id) ?? 0 })}
                </span>
              </span>
              <Link href={`/profile/days-off/${c.id}/notify`} className="btn btn-whatsapp min-h-10 shrink-0 px-3 text-sm">
                <Icon name="message" className="size-4" /> {t("Notify")}
              </Link>
              {isOwner && (
                <form action={removeDayOff.bind(null, c.id)}>
                  <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText={t("Remove?")}>
                    {t("Remove")}
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 px-1 text-sm text-muted">{t("Removing days off brings everyone's sessions on those days back.")}</p>

      {past.length > 0 && (
        <>
          <SectionTitle>{t("Past")}</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {past.map((c) => (
              <li key={c.id} className="px-4 py-3 text-muted">
                {when(c)}
                {c.reason ? ` · ${c.reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
