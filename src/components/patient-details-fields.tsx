import type { Address } from "@/lib/address";
import { DESIGNATIONS, PATIENT_TITLES } from "@/lib/names";
import { AddressFields } from "./address-fields";
import { DateField } from "./date-field";
import { PhoneField } from "./phone-field";
import { TitlePicker } from "./title-picker";

type Details = {
  date_of_birth?: string | null;
  dob_is_estimate?: boolean;
  gender?: string | null;
  emergency_title?: string;
  emergency_name?: string | null;
  emergency_relation?: string | null;
  emergency_phone?: string | null;
} & Partial<Address>;

/** Suggestions only — any relationship can be typed. */
const RELATIONS = ["Wife", "Husband", "Mother", "Father", "Son", "Daughter", "Brother", "Sister", "Guardian", "Caregiver", "Friend"];

/** Optional personal details: age or date of birth, gender, address, emergency contact. */
export function PatientDetailsFields({ today, clinicCountry, defaults = {} }: { today: string; clinicCountry: string; defaults?: Details }) {
  const knownDob = defaults.date_of_birth && !defaults.dob_is_estimate ? defaults.date_of_birth : "";
  const estimatedAge =
    defaults.date_of_birth && defaults.dob_is_estimate ? String(Number(today.slice(0, 4)) - Number(defaults.date_of_birth.slice(0, 4))) : "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <DateField name="date_of_birth" label="Date of birth" today={today} defaultValue={knownDob} max={today} shortcuts={[]} />
        <label className="field w-24">
          <span>
            or age <em>(yrs)</em>
          </span>
          <input name="age" type="number" inputMode="numeric" min={0} max={120} defaultValue={estimatedAge} />
        </label>
      </div>

      <fieldset className="field">
        <legend className="mb-1.5">Gender</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "", label: "Not set" },
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Other" },
          ].map((g) => (
            <label
              key={g.value || "none"}
              className="flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-surface px-4 text-base font-medium has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg"
            >
              <input type="radio" name="gender" value={g.value} defaultChecked={(defaults.gender ?? "") === g.value} className="sr-only" />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>

      <AddressFields clinicCountry={clinicCountry} defaults={defaults} />

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-base font-medium">Emergency contact</legend>
        <TitlePicker name="emergency_title" legend="Title" titles={PATIENT_TITLES} defaultValue={defaults.emergency_title ?? ""} />
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <label className="field">
            <span>Name</span>
            <input name="emergency_name" defaultValue={defaults.emergency_name ?? ""} placeholder="e.g. Anita Sharma" />
          </label>
          <label className="field">
            <span>Relationship</span>
            <input name="emergency_relation" list="relations" defaultValue={defaults.emergency_relation ?? ""} placeholder="e.g. Wife" />
          </label>
        </div>
        <datalist id="relations">
          {RELATIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </fieldset>
      <PhoneField name="emergency_phone" label="Emergency contact number" clinicCountry={clinicCountry} defaultPhone={defaults.emergency_phone ?? null} />
    </div>
  );
}

type Clinical = { referred_by_title?: string; referred_by?: string | null; injury_date?: string | null; goals?: string | null; precautions?: string | null };

/** Optional clinical details: referring doctor, injury / surgery date, goals, precautions. */
export function ClinicalFields({ today, defaults = {} }: { today: string; defaults?: Clinical }) {
  return (
    <div className="space-y-4">
      <DateField name="injury_date" label="Injury / surgery date" today={today} defaultValue={defaults.injury_date ?? ""} max={today} shortcuts={[]} />
      <div className="space-y-2">
        <TitlePicker name="referred_by_title" legend="Referred by" titles={DESIGNATIONS} defaultValue={defaults.referred_by ? (defaults.referred_by_title ?? "") : "Dr." /* most referrals come from doctors */} />
        <div className="field">
          <input name="referred_by" aria-label="Referred by — name" defaultValue={defaults.referred_by ?? ""} placeholder="e.g. Mehta, orthopaedic surgeon" />
        </div>
      </div>
      <label className="field">
        <span>Goals</span>
        <textarea name="goals" rows={2} defaultValue={defaults.goals ?? ""} placeholder="e.g. Climb stairs without support; return to running" />
      </label>
      <label className="field">
        <span>
          Precautions <em>(shown at the top of the patient&apos;s page)</em>
        </span>
        <textarea name="precautions" rows={2} defaultValue={defaults.precautions ?? ""} placeholder="e.g. Diabetic. Post-op — no knee flexion beyond 90°" />
      </label>
    </div>
  );
}
