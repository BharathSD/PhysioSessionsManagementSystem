import type { VisitType } from "@/lib/types";

/** Visit type as big tappable choices. Submits `name` (a visit type id, or "" for "Any"). */
export function VisitTypePicker({
  types,
  name = "visit_type_id",
  label = "Visit type",
  defaultValue,
  anyLabel,
}: {
  types: VisitType[];
  name?: string;
  label?: React.ReactNode;
  defaultValue?: string | null;
  /** Adds an "any type" choice (value "") — e.g. for packages. */
  anyLabel?: string;
}) {
  const options = [...(anyLabel ? [{ id: "", name: anyLabel }] : []), ...types.map((t) => ({ id: t.id, name: t.name }))];
  const selected = defaultValue ?? (anyLabel ? "" : types[0]?.id);

  return (
    <fieldset className="field">
      <legend className="mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id || "any"}
            className="flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-surface px-4 text-base font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
          >
            <input type="radio" name={name} value={o.id} defaultChecked={o.id === selected} className="sr-only" />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
