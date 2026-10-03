import { DateField } from "./date-field";
import { PhoneField } from "./phone-field";

type Details = {
  date_of_birth?: string | null;
  dob_is_estimate?: boolean;
  gender?: string | null;
  address?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
};

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

      <label className="field">
        <span>
          Address <em>(for home visits)</em>
        </span>
        <textarea name="address" rows={2} defaultValue={defaults.address ?? ""} placeholder="House no., street, area, city, PIN" />
      </label>

      <label className="field">
        <span>Emergency contact name</span>
        <input name="emergency_name" defaultValue={defaults.emergency_name ?? ""} placeholder="e.g. Anita (wife)" />
      </label>
      <PhoneField name="emergency_phone" label="Emergency contact number" clinicCountry={clinicCountry} defaultPhone={defaults.emergency_phone ?? null} />
    </div>
  );
}

type Clinical = { referred_by?: string | null; injury_date?: string | null; goals?: string | null; precautions?: string | null };

/** Optional clinical details: referring doctor, injury / surgery date, goals, precautions. */
export function ClinicalFields({ today, defaults = {} }: { today: string; defaults?: Clinical }) {
  return (
    <div className="space-y-4">
      <DateField name="injury_date" label="Injury / surgery date" today={today} defaultValue={defaults.injury_date ?? ""} max={today} shortcuts={[]} />
      <label className="field">
        <span>Referred by</span>
        <input name="referred_by" defaultValue={defaults.referred_by ?? ""} placeholder="e.g. Dr. Mehta, orthopaedic surgeon" />
      </label>
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
