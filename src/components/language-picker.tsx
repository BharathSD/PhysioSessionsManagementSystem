import { LOCALES, type Locale } from "@/i18n";
import { SubmitButton } from "./submit-button";

/**
 * English · हिन्दी, each in its own language, so anyone can find their way back.
 * `action` saves the choice (setLanguage when signed in, setLanguageCookie on the sign-in page).
 */
export function LanguagePicker({ current, action }: { current: Locale; action: (locale: string) => Promise<void> }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Language / भाषा">
      {(Object.keys(LOCALES) as Locale[]).map((code) => (
        <form key={code} action={action.bind(null, code)}>
          <SubmitButton
            className={`min-h-10 rounded-full border px-4 text-base font-medium ${
              current === code ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-fg"
            }`}
            aria-pressed={current === code}
            lang={code}
          >
            {LOCALES[code]}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
