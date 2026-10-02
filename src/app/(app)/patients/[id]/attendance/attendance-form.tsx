"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(app)/actions";
import { DateField } from "@/components/date-field";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { addDays } from "@/lib/schedule";
import type { VisitType } from "@/lib/types";

type Outcome = "attended" | "missed" | "cancelled_patient" | "cancelled_clinic";

const OUTCOMES: { value: Outcome; label: string; hint: string; icon: "check" | "x" | "ban"; tone: string }[] = [
  { value: "attended", label: "Present", hint: "The session happened", icon: "check", tone: "has-[:checked]:border-ok has-[:checked]:bg-ok-soft" },
  { value: "missed", label: "Absent", hint: "Didn't come, didn't inform", icon: "x", tone: "has-[:checked]:border-bad has-[:checked]:bg-bad-soft" },
  {
    value: "cancelled_patient",
    label: "Cancelled by patient",
    hint: "The patient called off this session",
    icon: "ban",
    tone: "has-[:checked]:border-warn has-[:checked]:bg-warn-soft",
  },
  {
    value: "cancelled_clinic",
    label: "Cancelled by clinic",
    hint: "You or the clinic called it off — never charged",
    icon: "ban",
    tone: "has-[:checked]:border-brand has-[:checked]:bg-brand-soft",
  },
];

/** Every attendance outcome, with fee and reschedule options only where they apply. */
export function AttendanceForm({
  action,
  types,
  defaultType,
  today,
  date,
  chargeHint,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  types: VisitType[];
  defaultType: string | null;
  today: string;
  date: string;
  /** What charging would do for absences / patient cancellations, e.g. "Uses 1 package session" or "₹300 fee". */
  chargeHint: { missed: string | null; cancelled_patient: string | null };
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [outcome, setOutcome] = useState<Outcome>("attended");
  const chargeable = outcome === "missed" || outcome === "cancelled_patient";
  const hint = chargeable ? chargeHint[outcome] : null;

  return (
    <form action={formAction} className="card space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-medium">What happened?</legend>
        {OUTCOMES.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-border px-4 py-2.5 ${o.tone}`}
          >
            <input
              type="radio"
              name="status"
              value={o.value}
              checked={outcome === o.value}
              onChange={() => setOutcome(o.value)}
              className="size-5 accent-[var(--brand)]"
            />
            <Icon name={o.icon} className="size-5 shrink-0" />
            <span>
              <span className="block text-base font-medium">{o.label}</span>
              <span className="block text-sm text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <VisitTypePicker types={types} defaultValue={defaultType} />

      {chargeable && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-3">
          <input type="checkbox" name="charge" className="mt-1 size-5 accent-[var(--brand)]" disabled={!hint} />
          <span>
            <span className="block text-base font-medium">{outcome === "missed" ? "Charge for the no-show" : "Charge a cancellation fee"}</span>
            <span className="block text-sm text-muted">
              {hint ?? `No ${outcome === "missed" ? "no-show" : "cancellation"} fee is set. Add one in Profile → Fees.`}
            </span>
          </span>
        </label>
      )}

      {outcome !== "attended" && (
        <div className="space-y-2">
          <DateField
            name="reschedule_date"
            label={
              <span>
                Reschedule to <em>(optional)</em>
              </span>
            }
            today={today}
            min={[addDays(date, 1), today].sort()[1]}
            shortcuts={["tomorrow"]}
          />
          <p className="text-sm text-muted">A booking is added for the new date.</p>
        </div>
      )}

      <label className="field">
        <span>
          Note <em>(optional)</em>
        </span>
        <input name="notes" placeholder={outcome === "attended" ? "e.g. worked on balance" : "e.g. called at 9 am, unwell"} />
      </label>

      {state?.error && (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-base text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
