import { DateField } from "./date-field";

type CaseText = {
  title?: string;
  opened_on?: string;
  chief_complaint?: string | null;
  history?: string | null;
  medical_history?: string | null;
  findings?: string | null;
  diagnosis?: string | null;
  goals?: string | null;
  plan?: string | null;
};

const SECTIONS: { name: keyof CaseText; label: string; hint: string; rows: number }[] = [
  { name: "chief_complaint", label: "Chief complaint", hint: "In the patient's words — e.g. “Pain in the right knee while climbing stairs”", rows: 2 },
  { name: "history", label: "History of the problem", hint: "How and when it started, what's been done so far, scans or reports", rows: 4 },
  { name: "medical_history", label: "Medical history", hint: "Other conditions, past surgeries, medications, allergies", rows: 3 },
  { name: "findings", label: "Examination findings", hint: "Posture, range of movement, strength, special tests, palpation…", rows: 4 },
  { name: "diagnosis", label: "Diagnosis / clinical impression", hint: "", rows: 2 },
  { name: "goals", label: "Goals", hint: "What the patient wants to get back to", rows: 2 },
  { name: "plan", label: "Treatment plan", hint: "Approach, frequency, expected duration", rows: 3 },
];

/** The free-text initial assessment of a case. */
export function CaseFields({ today, defaults = {} }: { today: string; defaults?: CaseText }) {
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <label className="field">
          <span>Case title</span>
          <input name="title" required defaultValue={defaults.title ?? ""} placeholder="e.g. Right knee — ACL reconstruction" />
        </label>
        <DateField name="opened_on" label="Started on" today={today} defaultValue={defaults.opened_on ?? today} max={today} shortcuts={["today"]} />
      </div>
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Initial assessment</h2>
        <p className="-mt-2 text-sm text-muted">Free text — fill in what&apos;s useful, skip the rest. You can edit it later.</p>
        {SECTIONS.map((s) => (
          <label key={s.name} className="field">
            <span>{s.label}</span>
            <textarea name={s.name} rows={s.rows} defaultValue={defaults[s.name] ?? ""} placeholder={s.hint} />
          </label>
        ))}
      </div>
    </div>
  );
}

export const CASE_SECTIONS = SECTIONS;
