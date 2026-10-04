"use client";

import Link from "next/link";
import { setPainScore } from "@/app/(app)/actions";
import { useT } from "@/i18n/client";
import { SubmitButton } from "./submit-button";

const SCORES = Array.from({ length: 11 }, (_, i) => i);

/** 0–10 pain score as tappable choices inside a form. Submits `pain_score` ("" = not recorded). */
export function PainPicker({ defaultValue = null }: { defaultValue?: number | null }) {
  const t = useT();
  return (
    <fieldset className="field">
      <legend className="mb-1">
        {t("Pain today")} <em>{t("(optional · 0 = none, 10 = worst)")}</em>
      </legend>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {SCORES.map((n) => (
          <label
            key={n}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-base font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg"
          >
            <input type="radio" name="pain_score" value={n} defaultChecked={defaultValue === n} className="sr-only" />
            {n}
          </label>
        ))}
        <label className="col-span-1 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-xs font-medium text-muted has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
          <input type="radio" name="pain_score" value="" defaultChecked={defaultValue == null} className="sr-only" />
          {t("Skip")}
        </label>
      </div>
    </fieldset>
  );
}

/**
 * Right after "Present": one tap records the pain score. Once recorded it shows
 * "Pain 4/10" with a link to change it on the visit's edit screen.
 */
export function QuickPain({ sessionId, score, editHref }: { sessionId: string; score: number | null; editHref: string }) {
  const t = useT();
  if (score !== null) {
    return (
      <p className="text-sm">
        <span className="text-muted">{t("Pain")} </span>
        <span className="font-semibold">{score}/10</span>{" "}
        <Link href={editHref} className="text-brand underline underline-offset-2">
          {t("change")}
        </Link>
      </p>
    );
  }
  return (
    <form action={setPainScore.bind(null, sessionId)} className="space-y-1.5">
      <p className="text-sm text-muted">{t("Pain today? (0 = none, 10 = worst) — optional")}</p>
      <div className="grid grid-cols-11 gap-1">
        {SCORES.map((n) => (
          <SubmitButton
            key={n}
            name="pain_score"
            value={n}
            className="min-h-10 rounded-lg border border-border bg-surface text-sm font-semibold active:bg-brand active:text-brand-fg"
            aria-label={t("Pain {n} out of 10", { n })}
          >
            {n}
          </SubmitButton>
        ))}
      </div>
    </form>
  );
}
