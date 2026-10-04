import { ActionForm } from "@/components/action-form";
import { CHIP } from "@/components/chip";
import { Icon } from "@/components/icons";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { whatsappLink } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { physioName } from "@/lib/names";
import { sendFeedback } from "../../actions";

export const generateMetadata = titled(msg("Help & feedback"));

const KINDS = [
  { value: "problem", label: msg("Something's wrong") },
  { value: "idea", label: msg("An idea") },
  { value: "praise", label: msg("I like something") },
] as const;

/** Support number, digits only with country code (see .env.example). */
const SUPPORT = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

export default async function HelpPage(props: PageProps<"/profile/help">) {
  const problem = firstParam((await props.searchParams).problem);
  const { supabase, clinic, member, userId } = await getContext();
  const t = await getT();
  const { data: sent } = await supabase
    .from("feedback")
    .select("id, kind, message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: t("Profile") }}
        title={t("Help & feedback")}
        subtitle={t("Stuck, found a problem, or wish it did something? Tell us.")}
      />

      {SUPPORT && (
        <a
          href={whatsappLink(SUPPORT, `Hi, I need help with Physio Sessions. (${physioName(member)}, ${clinic.name})`)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-whatsapp mb-2 min-h-12 w-full text-base"
        >
          <Icon name="message" /> {t("Chat with us on WhatsApp")}
        </a>
      )}

      <SectionTitle>{t("Send feedback")}</SectionTitle>
      <ActionForm action={sendFeedback} submitLabel={t("Send")} resetOnSuccess className="card space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-base font-medium">{t("What is it about?")}</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className={CHIP}>
                <input type="radio" name="kind" value={k.value} required defaultChecked={Boolean(problem) && k.value === "problem"} className="sr-only" />
                {t(k.label)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>{t("Your message")}</span>
          <textarea
            name="message"
            rows={5}
            required
            maxLength={4000}
            placeholder={problem ? t("What were you doing when it happened?") : t("e.g. It would help if I could…")}
          />
        </label>
        {problem && <input type="hidden" name="reference" value={problem} />}
        <p className="text-sm text-muted">{t("We also get your phone/browser type so we can fix problems faster — never your patients' details.")}</p>
      </ActionForm>

      {sent && sent.length > 0 && (
        <>
          <SectionTitle>{t("You sent")}</SectionTitle>
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
            {sent.map((f) => (
              <li key={f.id} className="border-t border-border px-4 py-3 first:border-t-0">
                <p className="text-sm text-muted">
                  {t.date((f.created_at as string).slice(0, 10))} · {t(KINDS.find((k) => k.value === f.kind)?.label ?? "")}
                </p>
                <p className="line-clamp-3 text-base whitespace-pre-line">{f.message}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
