// Inputs for pain assessments: tap-chips, 0–10 score rows and one-of choices.
// Plain form controls (no JavaScript needed); the checked option is highlighted.

const CHIP =
  "flex min-h-10 cursor-pointer items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40";

/** Several-of choices as chips. Submits `name` once per ticked option. */
export function ChipGroup({ name, legend, options, defaults = [] }: { name: string; legend: string; options: string[]; defaults?: string[] }) {
  const all = [...options, ...defaults.filter((d) => !options.includes(d))];
  return (
    <fieldset>
      <legend className="mb-1.5 text-base font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {all.map((o) => (
          <label key={o} className={CHIP}>
            <input type="checkbox" name={name} value={o} defaultChecked={defaults.includes(o)} className="sr-only" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One-of choices as chips, with a way to leave it unset. */
export function ChoiceChips({
  name,
  legend,
  options,
  defaultValue = "",
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-base font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[{ value: "", label: "Not recorded" }, ...options].map((o) => (
          <label key={o.value || "none"} className={CHIP}>
            <input type="radio" name={name} value={o.value} defaultChecked={(defaultValue ?? "") === o.value} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A 0–10 score as a row of buttons (plus "–" for not recorded). */
export function ScoreRow({ name, label, defaultValue = null, hint }: { name: string; label: string; defaultValue?: number | null; hint?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-baseline justify-between text-base font-medium">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </legend>
      <div className="grid grid-cols-12 gap-1">
        <label className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
          <input type="radio" name={name} value="" defaultChecked={defaultValue === null} className="sr-only" />–
        </label>
        {Array.from({ length: 11 }, (_, n) => (
          <label
            key={n}
            className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg"
          >
            <input type="radio" name={name} value={n} defaultChecked={defaultValue === n} aria-label={`${label}: ${n} out of 10`} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
