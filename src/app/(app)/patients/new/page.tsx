import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { AddPatientWizard } from "./wizard";

export const metadata = { title: "Add patient" };

export default async function NewPatientPage(props: PageProps<"/patients/new">) {
  const type = firstParam((await props.searchParams).type);
  const { clinic } = await getContext();

  if (type !== "new" && type !== "existing") {
    return (
      <div>
        <PageHeader back={{ href: "/patients", label: "Patients" }} title="Add patient" subtitle="Who are you adding?" />
        <div className="space-y-3">
          <ChoiceCard
            href="/patients/new?type=new"
            icon="plus"
            title="A new patient"
            text="Starting treatment now. Add their details, package and schedule."
          />
          <ChoiceCard
            href="/patients/new?type=existing"
            icon="history"
            title="An existing patient"
            text="Already being treated — moving them over from your notebook or Excel, with sessions done and payments made so far."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/patients/new", label: "Back" }}
        title={type === "existing" ? "Add existing patient" : "Add new patient"}
      />
      <AddPatientWizard key={type} existing={type === "existing"} today={todayIn(clinic.timezone)} clinicCountry={clinic.country} />
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
