import { CHIP } from "./assessment-inputs";

/** One-of title chips plus "None". Submits `name`. */
export function TitlePicker({
  name,
  legend,
  titles,
  defaultValue = "",
}: {
  name: string;
  legend: React.ReactNode;
  titles: readonly string[];
  defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[...titles, ""].map((t) => (
          <label key={t || "none"} className={CHIP}>
            <input type="radio" name={name} value={t} defaultChecked={defaultValue === t} className="sr-only" />
            {t || "None"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
