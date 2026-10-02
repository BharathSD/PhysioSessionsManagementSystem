"use client";

import { useRef, useState } from "react";
import { DateField } from "@/components/date-field";
import { FeeInputs } from "@/components/fee-inputs";
import { Icon } from "@/components/icons";
import { MethodPicker } from "@/components/method-picker";
import { MultiDateField } from "@/components/multi-date-field";
import { PaymentRows } from "@/components/payment-rows";
import { PhoneField } from "@/components/phone-field";
import { PlanFields } from "@/components/plan-fields";
import { SubmitButton } from "@/components/submit-button";
import { VisitTypePicker } from "@/components/visit-type-picker";
import type { VisitType } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";
import { createPatient } from "../../actions";

type Step = { title: string; hint: string; body: React.ReactNode };

/**
 * Add-patient flow, one short step per screen. All steps live in one form
 * (hidden ones still submit), so nothing is saved until the final step.
 */
export function AddPatientWizard({
  existing,
  today,
  clinicCountry,
  types,
  defaultFees,
  currency,
}: {
  existing: boolean;
  today: string;
  clinicCountry: string;
  types: VisitType[];
  defaultFees: Record<string, number | null>;
  currency: string;
}) {
  const [state, onSubmit, pending] = useFormAction(createPatient, undefined);
  const [step, setStep] = useState(0);
  const [usualType, setUsualType] = useState(types[0]?.id ?? "");
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  const details: Step = {
    title: "Patient details",
    hint: "Only the name is required.",
    body: (
      <>
        <label className="field">
          <span>Full name</span>
          <input name="name" required autoComplete="off" autoCapitalize="words" placeholder="e.g. Rahul Sharma" />
        </label>
        <PhoneField label={<span>WhatsApp number <em>(to send receipts)</em></span>} clinicCountry={clinicCountry} />
        <label className="field">
          <span>Condition <em>(optional)</em></span>
          <input name="condition" placeholder="e.g. Knee rehab, frozen shoulder" />
        </label>
        <div onChange={(e) => setUsualType((e.target as HTMLInputElement).value)}>
          <VisitTypePicker types={types} label="Usually seen as" defaultValue={usualType} />
        </div>
      </>
    ),
  };

  const packageStep: Step = {
    title: existing ? "Current package" : "Package & payment",
    hint: existing
      ? "The package they are on now. Skip this if they pay per visit."
      : "How many sessions they paid for. Skip this if they pay per visit.",
    body: (
      <>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Number of sessions</span>
            <input name="sessions" type="number" inputMode="numeric" min={1} placeholder="e.g. 10" />
          </label>
          <label className="field">
            <span>Package price</span>
            <input name="price" inputMode="decimal" placeholder="e.g. 5000" />
          </label>
        </div>
        {existing && (
          <>
            <DateField name="package_start" label="Package started on" today={today} max={today} shortcuts={[]} />
            <label className="field">
              <span>
                Sessions already done <em>(if you don&apos;t have the dates)</em>
              </span>
              <input name="used_before" type="number" inputMode="numeric" min={0} placeholder="e.g. 6" />
            </label>
          </>
        )}
        <VisitTypePicker types={types} name="package_visit_type" label="Package sessions are for" anyLabel="Any visit type" />

        {!existing && (
          <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
            <p className="text-base font-medium">Payment received now</p>
            <label className="field">
              <span>Amount</span>
              <input name="paid_now" inputMode="decimal" placeholder="0" />
            </label>
            <MethodPicker />
            <DateField name="paid_on" label="Paid on" today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} />
          </div>
        )}
      </>
    ),
  };

  const paymentsStep: Step = {
    title: "Payments so far",
    hint: "Add each payment with the date it was made. Skip if nothing was paid yet.",
    body: <PaymentRows today={today} />,
  };

  const visitsStep: Step = {
    title: "Past visits",
    hint: "Optional. If your notebook has dates, tap them here. Don't also count these in “Sessions already done”.",
    body: <MultiDateField today={today} />,
  };

  const feesStep: Step = {
    title: "Fees",
    hint: "Your default fees are filled in. Change any that are different for this patient — you can update them any time.",
    body: <FeeInputs types={types} current={defaultFees} defaults={defaultFees} currency={currency} />,
  };

  const scheduleStep: Step = {
    title: "Schedule",
    hint: "Which days they come. You can change this any time as they progress.",
    body: <PlanFields key={usualType} today={today} types={types} defaultType={usualType} allowNone />,
  };

  const steps = existing
    ? [details, packageStep, paymentsStep, feesStep, visitsStep, scheduleStep]
    : [details, packageStep, feesStep, scheduleStep];
  const last = step === steps.length - 1;

  function goNext() {
    const fields = stepRefs.current[step]?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? [];
    for (const el of fields) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return;
      }
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        // Enter moves to the next step instead of saving half-way through.
        if (e.key === "Enter" && !last && !e.defaultPrevented && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          goNext();
        }
      }}
    >
      {/* Progress */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-muted">
          Step {step + 1} of {steps.length}
        </p>
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <span key={s.title} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-surface-2"}`} />
          ))}
        </div>
      </div>

      {steps.map((s, i) => (
        <div
          key={s.title}
          ref={(el) => {
            stepRefs.current[i] = el;
          }}
          hidden={i !== step}
          className="card space-y-4"
        >
          <div>
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-0.5 text-base text-muted">{s.hint}</p>
          </div>
          {s.body}
        </div>
      ))}

      {state?.error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-bad-soft p-3 text-base text-bad">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mt-4 flex gap-3 bg-bg/95 py-3 backdrop-blur md:bottom-0">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="btn min-h-12 flex-1 text-base">
            <Icon name="back" /> Back
          </button>
        )}
        {last ? (
          <SubmitButton className="btn btn-primary min-h-12 flex-[2] text-base" pendingText="Saving…" pending={pending}>
            <Icon name="check" /> Save patient
          </SubmitButton>
        ) : (
          <button type="button" onClick={goNext} className="btn btn-primary min-h-12 flex-[2] text-base">
            Next <Icon name="chevron" />
          </button>
        )}
      </div>
    </form>
  );
}
