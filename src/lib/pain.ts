// Pain assessment vocabulary and body-chart regions. Saved in English (as
// written here) and shown translated with t().

import { EN, msg, type T } from "@/i18n";

export type View = "front" | "back";

type Box = { x: number; y: number; w: number; h: number; rx?: number };
type Part = { part: string; front: string; back: string; side?: "r" | "l"; box: Box };

/**
 * Body chart drawn on a 120 × 250 grid. Boxes are given for the FRONT view,
 * where the patient's right side is on the viewer's left; the back view mirrors
 * them, so the patient's right is on the viewer's right.
 */
const PARTS: Part[] = [
  { part: "head", front: msg("Head / face"), back: msg("Back of head"), box: { x: 48, y: 4, w: 24, h: 26, rx: 12 } },
  { part: "neck", front: msg("Front of neck"), back: msg("Neck"), box: { x: 54, y: 30, w: 12, h: 8, rx: 3 } },
  { part: "shoulder-r", side: "r", front: msg("Right shoulder"), back: msg("Right shoulder blade"), box: { x: 30, y: 38, w: 18, h: 14, rx: 6 } },
  { part: "shoulder-l", side: "l", front: msg("Left shoulder"), back: msg("Left shoulder blade"), box: { x: 72, y: 38, w: 18, h: 14, rx: 6 } },
  { part: "chest", front: msg("Chest"), back: msg("Upper back"), box: { x: 48, y: 38, w: 24, h: 30, rx: 4 } },
  { part: "abdomen", front: msg("Abdomen"), back: msg("Lower back"), box: { x: 48, y: 68, w: 24, h: 26, rx: 4 } },
  { part: "upper-arm-r", side: "r", front: msg("Right upper arm"), back: msg("Back of right upper arm"), box: { x: 24, y: 52, w: 14, h: 30, rx: 6 } },
  { part: "upper-arm-l", side: "l", front: msg("Left upper arm"), back: msg("Back of left upper arm"), box: { x: 82, y: 52, w: 14, h: 30, rx: 6 } },
  { part: "elbow-r", side: "r", front: msg("Right elbow (inner)"), back: msg("Right elbow"), box: { x: 22, y: 82, w: 14, h: 10, rx: 4 } },
  { part: "elbow-l", side: "l", front: msg("Left elbow (inner)"), back: msg("Left elbow"), box: { x: 84, y: 82, w: 14, h: 10, rx: 4 } },
  { part: "forearm-r", side: "r", front: msg("Right forearm"), back: msg("Back of right forearm"), box: { x: 18, y: 92, w: 14, h: 28, rx: 5 } },
  { part: "forearm-l", side: "l", front: msg("Left forearm"), back: msg("Back of left forearm"), box: { x: 88, y: 92, w: 14, h: 28, rx: 5 } },
  { part: "hand-r", side: "r", front: msg("Right wrist / palm"), back: msg("Back of right hand"), box: { x: 14, y: 120, w: 16, h: 22, rx: 6 } },
  { part: "hand-l", side: "l", front: msg("Left wrist / palm"), back: msg("Back of left hand"), box: { x: 90, y: 120, w: 16, h: 22, rx: 6 } },
  { part: "hip-r", side: "r", front: msg("Right hip / groin"), back: msg("Right buttock"), box: { x: 46, y: 94, w: 14, h: 18, rx: 4 } },
  { part: "hip-l", side: "l", front: msg("Left hip / groin"), back: msg("Left buttock"), box: { x: 60, y: 94, w: 14, h: 18, rx: 4 } },
  { part: "thigh-r", side: "r", front: msg("Front of right thigh"), back: msg("Back of right thigh"), box: { x: 44, y: 112, w: 15, h: 44, rx: 6 } },
  { part: "thigh-l", side: "l", front: msg("Front of left thigh"), back: msg("Back of left thigh"), box: { x: 61, y: 112, w: 15, h: 44, rx: 6 } },
  { part: "knee-r", side: "r", front: msg("Right knee"), back: msg("Back of right knee"), box: { x: 44, y: 156, w: 15, h: 14, rx: 5 } },
  { part: "knee-l", side: "l", front: msg("Left knee"), back: msg("Back of left knee"), box: { x: 61, y: 156, w: 15, h: 14, rx: 5 } },
  { part: "shin-r", side: "r", front: msg("Right shin"), back: msg("Right calf"), box: { x: 45, y: 170, w: 13, h: 46, rx: 5 } },
  { part: "shin-l", side: "l", front: msg("Left shin"), back: msg("Left calf"), box: { x: 62, y: 170, w: 13, h: 46, rx: 5 } },
  { part: "foot-r", side: "r", front: msg("Right ankle / foot"), back: msg("Right heel / Achilles"), box: { x: 42, y: 216, w: 16, h: 20, rx: 5 } },
  { part: "foot-l", side: "l", front: msg("Left ankle / foot"), back: msg("Left heel / Achilles"), box: { x: 62, y: 216, w: 16, h: 20, rx: 5 } },
];

export type Region = { key: string; view: View; label: string; box: Required<Box> };

export const BODY_REGIONS: Region[] = (["front", "back"] as const).flatMap((view) =>
  PARTS.map((p) => ({
    key: `${view}:${p.part}`,
    view,
    label: view === "front" ? p.front : p.back,
    // Mirror the back view so the patient's right is on the viewer's right.
    box: { rx: 4, ...p.box, x: view === "front" ? p.box.x : 120 - p.box.x - p.box.w },
  })),
);

const LABEL = new Map(BODY_REGIONS.map((r) => [r.key, r.label]));
export const regionLabel = (key: string) => LABEL.get(key) ?? key;

export const CHARACTER = [msg("Sharp"), msg("Dull ache"), msg("Burning"), msg("Throbbing"), msg("Stabbing"), msg("Shooting"), msg("Tingling"), msg("Stiffness"), msg("Cramping")];
export const WORSE_TIMES = [msg("Morning"), msg("Afternoon"), msg("Evening"), msg("Night")];
export const AGGRAVATING = [
  msg("Sitting"),
  msg("Standing"),
  msg("Walking"),
  msg("Stairs"),
  msg("Bending"),
  msg("Lifting"),
  msg("Twisting"),
  msg("Lying down"),
  msg("Getting up from a chair"),
  msg("Reaching overhead"),
  msg("Coughing / sneezing"),
  msg("Cold weather"),
];
export const EASING = [msg("Rest"), msg("Movement"), msg("Heat"), msg("Ice"), msg("Medication"), msg("Lying down"), msg("Stretching"), msg("Massage")];
export const NERVE_SYMPTOMS = [msg("Pins and needles"), msg("Numbness"), msg("Weakness"), msg("Electric-shock feeling")];
export const RED_FLAGS = [
  msg("Night pain not eased by rest or position"),
  msg("Unexplained weight loss"),
  msg("Fever or feeling generally unwell"),
  msg("Bladder or bowel changes"),
  msg("Numbness around the groin / saddle area"),
  msg("Worsening weakness"),
  msg("History of cancer"),
  msg("Recent major fall or accident"),
];

/** The 0–10 scores an assessment can hold, in display order. */
export const SCORES = [
  { key: "at_rest", label: msg("At rest") },
  { key: "on_activity", label: msg("On activity") },
  { key: "at_night", label: msg("At night") },
  { key: "worst_24h", label: msg("Worst (24 h)") },
  { key: "best_24h", label: msg("Best (24 h)") },
  { key: "before_session", label: msg("Before session") },
  { key: "after_session", label: msg("After session") },
] as const;
export type ScoreKey = (typeof SCORES)[number]["key"];

export type PainAssessment = {
  id: string;
  patient_id: string;
  case_id: string | null;
  session_id: string | null;
  assessed_on: string;
  kind: "initial" | "reassessment" | "session" | "discharge";
  locations: string[];
  radiating: string[];
  character: string[];
  pattern: "constant" | "intermittent" | null;
  worse_times: string[];
  morning_stiffness_min: number | null;
  aggravating: string[];
  easing: string[];
  onset: "sudden" | "gradual" | null;
  nerve_symptoms: string[];
  red_flags: string[];
  activities: { name: string; score: number }[];
  notes: string | null;
  created_at: string;
} & Record<ScoreKey, number | null>;

export const KIND_LABEL: Record<PainAssessment["kind"], string> = {
  initial: msg("Initial assessment"),
  reassessment: msg("Reassessment"),
  session: msg("Session check"),
  discharge: msg("At discharge"),
};

/** "At rest 3 · On activity 6" — the scores that were recorded. */
export function scoreLine(a: Pick<PainAssessment, ScoreKey>, t: T = EN): string {
  return SCORES.filter((s) => a[s.key] !== null)
    .map((s) => `${t(s.label)} ${a[s.key]}`)
    .join(" · ");
}
