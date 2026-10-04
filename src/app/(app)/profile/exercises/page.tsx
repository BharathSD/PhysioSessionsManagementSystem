import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { addLibraryItem, setLibraryItemArchived, updateLibraryItem } from "../../actions";

export const generateMetadata = titled(msg("Exercises & treatments"));

type Item = { id: string; kind: "exercise" | "treatment"; name: string; dosage: string | null; archived: boolean };

export default async function ExercisesPage() {
  const { supabase } = await getContext();
  const t = await getT();
  const { data } = await supabase.from("exercise_library").select("id, kind, name, dosage, archived").order("name");
  const items = (data ?? []) as Item[];

  const list = (kind: Item["kind"], title: string) => {
    const active = items.filter((i) => i.kind === kind && !i.archived);
    return (
      <>
        <SectionTitle aside={`${active.length}`}>{title}</SectionTitle>
        {active.length === 0 ? (
          <p className="card text-base text-muted">
            {t("None yet. Add them below, or just type them in a session record — they're saved here automatically.")}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {active.map((i) => (
              <li key={i.id} className="px-4 py-2">
                <details>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">{i.name}</span>
                      {i.dosage && <span className="text-muted"> · {i.dosage}</span>}
                    </span>
                    <span className="text-sm text-brand">{t("Edit")}</span>
                  </summary>
                  <div className="space-y-3 pt-2 pb-2">
                    <ActionForm action={updateLibraryItem.bind(null, i.id)} submitLabel={t("Save")} className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                        <label className="field">
                          <span>{t("Name")}</span>
                          <input name="name" defaultValue={i.name} required />
                        </label>
                        <label className="field">
                          <span>{t("Usual dosage")}</span>
                          <input name="dosage" defaultValue={i.dosage ?? ""} />
                        </label>
                      </div>
                    </ActionForm>
                    <form action={setLibraryItemArchived.bind(null, i.id, true)}>
                      <SubmitButton className="btn w-full text-muted">{t("Hide from the list")}</SubmitButton>
                    </form>
                    <p className="text-sm text-muted">{t("Past session records keep the name they were saved with.")}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const hidden = items.filter((i) => i.archived);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: t("Profile") }}
        title={t("Exercises & treatments")}
        subtitle={t("Your own list — tap to add them to a session record, with their usual dosage.")}
      />

      <ActionForm action={addLibraryItem} submitLabel={t("Add to list")} resetOnSuccess className="card space-y-3">
        <fieldset className="field">
          <legend className="mb-1.5">{t("Type")}</legend>
          <div className="flex gap-2">
            {[
              { value: "exercise", label: t("Exercise") },
              { value: "treatment", label: t("Treatment") },
            ].map((o) => (
              <label
                key={o.value}
                className="flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-surface px-4 text-base font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg"
              >
                <input type="radio" name="kind" value={o.value} defaultChecked={o.value === "exercise"} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="field">
            <span>{t("Name")}</span>
            <input name="name" required placeholder={t("e.g. Straight leg raise, IFT, Ultrasound")} />
          </label>
          <label className="field">
            <span>
              {t("Usual dosage")} <em>{t("(optional)")}</em>
            </span>
            <input name="dosage" placeholder={t("e.g. 3 × 10, 10 min")} />
          </label>
        </div>
      </ActionForm>

      {list("exercise", t("Exercises"))}
      {list("treatment", t("Treatments"))}

      {hidden.length > 0 && (
        <>
          <SectionTitle>{t("Hidden")}</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {hidden.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted">{i.name}</span>
                <form action={setLibraryItemArchived.bind(null, i.id, false)}>
                  <SubmitButton className="btn min-h-10 text-sm">{t("Show again")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
