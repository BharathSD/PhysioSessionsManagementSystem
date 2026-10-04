// The free-text sections of a case's initial assessment (shared by the form and the case page).

import { msg } from "@/i18n";

export type CaseText = {
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

export const CASE_SECTIONS: { name: keyof CaseText; label: string; hint: string; rows: number }[] = [
  {
    name: "chief_complaint",
    label: msg("Chief complaint"),
    hint: msg("In the patient's words — e.g. “Pain in the right knee while climbing stairs”"),
    rows: 2,
  },
  { name: "history", label: msg("History of the problem"), hint: msg("How and when it started, what's been done so far, scans or reports"), rows: 4 },
  { name: "medical_history", label: msg("Medical history"), hint: msg("Other conditions, past surgeries, medications, allergies"), rows: 3 },
  { name: "findings", label: msg("Examination findings"), hint: msg("Posture, range of movement, strength, special tests, palpation…"), rows: 4 },
  { name: "diagnosis", label: msg("Diagnosis / clinical impression"), hint: "", rows: 2 },
  { name: "goals", label: msg("Goals"), hint: msg("What the patient wants to get back to"), rows: 2 },
  { name: "plan", label: msg("Treatment plan"), hint: msg("Approach, frequency, expected duration"), rows: 3 },
];
