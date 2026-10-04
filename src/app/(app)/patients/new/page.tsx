import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { getTeam } from "@/lib/team";
import { standardFee } from "@/lib/fees";
import { firstParam } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { AddPatientWizard } from "./wizard";

export const generateMetadata = titled(msg("Add patient"));

export default async function NewPatientPage(props: PageProps<"/patients/new">) {
  const type = firstParam((await props.searchParams).type);
  const t = await getT();
  const [{ clinic, userId }, { activeTypes, rates }, { members }] = await Promise.all([getContext(), getBilling(), getTeam()]);
  const today = todayIn(clinic.timezone);
  const defaultFees = Object.fromEntries(activeTypes.map((t) => [t.id, standardFee(rates, "visit", t.id, today)]));

  if (type !== "new" && type !== "existing") {
    return (
      <div>
        <PageHeader back={{ href: "/patients", label: t("Patients") }} title={t("Add patient")} subtitle={t("Who are you adding?")} />
        <div className="space-y-3">
          <ChoiceCard
            href="/patients/new?type=new"
            icon="plus"
            title={t("A new patient")}
            text={t("Starting treatment now. Add their details, package and schedule.")}
          />
          <ChoiceCard
            href="/patients/new?type=existing"
            icon="history"
            title={t("An existing patient")}
            text={t("Already being treated — moving them over from your notebook or Excel, with sessions done and payments made so far.")}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/patients/new", label: t("Back") }}
        title={type === "existing" ? t("Add existing patient") : t("Add new patient")}
      />
      <AddPatientWizard
        key={type}
        existing={type === "existing"}
        today={today}
        clinicCountry={clinic.country}
        types={activeTypes}
        defaultFees={defaultFees}
        currency={clinic.currency}
        team={members}
        me={userId}
      />
    </div>
  );
}

function ChoiceCard({ href, icon, title, text }: { href: string; icon: "plus" | "history"; title: string; text: string }) {
  return (
    <Link href={href} className="card flex items-center gap-4 active:scale-[0.99]">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon name={icon} className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-base text-muted">{text}</span>
      </span>
      <Icon name="chevron" className="size-5 shrink-0 text-muted" />
    </Link>
  );
}
