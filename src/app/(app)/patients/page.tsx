import Link from "next/link";
import { BalanceChips } from "@/components/balance";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader, initials } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam, toSummary } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import type { PatientSummary } from "@/lib/types";

export const metadata = { title: "Patients" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "due", label: "Money due" },
  { key: "ending", label: "Running out" },
  { key: "archived", label: "Archived" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const MATCH: Record<FilterKey, (p: PatientSummary) => boolean> = {
  all: () => true,
  due: (p) => p.amount_due > 0,
  ending: (p) => p.sessions_bought > 0 && p.sessions_left <= 1 && !(p.sessions_left < 0 && p.rate_per_session !== null),
  archived: () => true,
};

export default async function PatientsPage(props: PageProps<"/patients">) {
  const params = await props.searchParams;
  const q = firstParam(params.q);
  const filter = (FILTERS.find((f) => f.key === firstParam(params.filter))?.key ?? "all") as FilterKey;
  const { supabase, clinic } = await getContext();

  let query = supabase.from("patient_summary").select("*").eq("archived", filter === "archived").order("name");
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) query = query.ilike("phone", `%${digits}%`);
  else if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const patients = (data ?? []).map(toSummary).filter(MATCH[filter]);
  if (filter === "due") patients.sort((a, b) => b.amount_due - a.amount_due);

  const href = (f: FilterKey) => {
    const sp = new URLSearchParams();
    if (f !== "all") sp.set("filter", f);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/patients?${s}` : "/patients";
  };

  return (
    <div>
      <PageHeader
        title="Patients"
        action={
          <Link href="/patients/new" className="btn btn-primary shrink-0 text-base">
            <Icon name="plus" /> Add patient
          </Link>
        }
      />

      <form role="search" className="relative">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or phone…"
          className="min-h-12 w-full rounded-2xl border border-border bg-surface pr-4 pl-11 text-base outline-none focus:border-brand"
        />
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            replace
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              filter === f.key ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {filter === "due" && patients.length > 0 && (
        <p className="mt-3 px-1 text-base">
          Total due:{" "}
          <span className="font-semibold text-bad">
            {formatMoney(
              patients.reduce((s, p) => s + p.amount_due, 0),
              clinic.currency,
            )}
          </span>
        </p>
      )}

      <div className="mt-4">
        {patients.length === 0 ? (
          <EmptyState
            title={
              q
                ? "No patients match your search"
                : { all: "No patients yet", due: "No one owes money 🎉", ending: "No packages running out", archived: "No archived patients" }[filter]
            }
          >
            {filter === "all" && !q && "Tap “Add patient” to get started."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {patients.map((p) => (
              <li key={p.id}>
                <Link href={`/patients/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-semibold text-brand">
                    {initials(p.name) || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{p.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {p.last_visit ? `Last visit ${formatDate(p.last_visit)}` : "No visits yet"}
                      {p.condition ? ` · ${p.condition}` : ""}
                    </span>
                    <span className="mt-1.5 block">
                      <BalanceChips p={p} currency={clinic.currency} />
                    </span>
                  </span>
                  <Icon name="chevron" className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
