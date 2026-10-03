// Pain assessment vocabulary and body-chart regions.

export type View = "front" | "back";

type Box = { x: number; y: number; w: number; h: number; rx?: number };
type Part = { part: string; front: string; back: string; side?: "r" | "l"; box: Box };

/**
 * Body chart drawn on a 120 × 250 grid. Boxes are given for the FRONT view,
 * where the patient's right side is on the viewer's left; the back view mirrors
 * them, so the patient's right is on the viewer's right.
 */
const PARTS: Part[] = [
  { part: "head", front: "Head / face", back: "Back of head", box: { x: 48, y: 4, w: 24, h: 26, rx: 12 } },
  { part: "neck", front: "Front of neck", back: "Neck", box: { x: 54, y: 30, w: 12, h: 8, rx: 3 } },
  { part: "shoulder-r", side: "r", front: "Right shoulder", back: "Right shoulder blade", box: { x: 30, y: 38, w: 18, h: 14, rx: 6 } },
  { part: "shoulder-l", side: "l", front: "Left shoulder", back: "Left shoulder blade", box: { x: 72, y: 38, w: 18, h: 14, rx: 6 } },
  { part: "chest", front: "Chest", back: "Upper back", box: { x: 48, y: 38, w: 24, h: 30, rx: 4 } },
  { part: "abdomen", front: "Abdomen", back: "Lower back", box: { x: 48, y: 68, w: 24, h: 26, rx: 4 } },
  { part: "upper-arm-r", side: "r", front: "Right upper arm", back: "Back of right upper arm", box: { x: 24, y: 52, w: 14, h: 30, rx: 6 } },
  { part: "upper-arm-l", side: "l", front: "Left upper arm", back: "Back of left upper arm", box: { x: 82, y: 52, w: 14, h: 30, rx: 6 } },
  { part: "elbow-r", side: "r", front: "Right elbow (inner)", back: "Right elbow", box: { x: 22, y: 82, w: 14, h: 10, rx: 4 } },
  { part: "elbow-l", side: "l", front: "Left elbow (inner)", back: "Left elbow", box: { x: 84, y: 82, w: 14, h: 10, rx: 4 } },
  { part: "forearm-r", side: "r", front: "Right forearm", back: "Back of right forearm", box: { x: 18, y: 92, w: 14, h: 28, rx: 5 } },
  { part: "forearm-l", side: "l", front: "Left forearm", back: "Back of left forearm", box: { x: 88, y: 92, w: 14, h: 28, rx: 5 } },
  { part: "hand-r", side: "r", front: "Right wrist / palm", back: "Back of right hand", box: { x: 14, y: 120, w: 16, h: 22, rx: 6 } },
  { part: "hand-l", side: "l", front: "Left wrist / palm", back: "Back of left hand", box: { x: 90, y: 120, w: 16, h: 22, rx: 6 } },
  { part: "hip-r", side: "r", front: "Right hip / groin", back: "Right buttock", box: { x: 46, y: 94, w: 14, h: 18, rx: 4 } },
  { part: "hip-l", side: "l", front: "Left hip / groin", back: "Left buttock", box: { x: 60, y: 94, w: 14, h: 18, rx: 4 } },
  { part: "thigh-r", side: "r", front: "Front of right thigh", back: "Back of right thigh", box: { x: 44, y: 112, w: 15, h: 44, rx: 6 } },
  { part: "thigh-l", side: "l", front: "Front of left thigh", back: "Back of left thigh", box: { x: 61, y: 112, w: 15, h: 44, rx: 6 } },
  { part: "knee-r", side: "r", front: "Right knee", back: "Back of right knee", box: { x: 44, y: 156, w: 15, h: 14, rx: 5 } },
  { part: "knee-l", side: "l", front: "Left knee", back: "Back of left knee", box: { x: 61, y: 156, w: 15, h: 14, rx: 5 } },
  { part: "shin-r", side: "r", front: "Right shin", back: "Right calf", box: { x: 45, y: 170, w: 13, h: 46, rx: 5 } },
  { part: "shin-l", side: "l", front: "Left shin", back: "Left calf", box: { x: 62, y: 170, w: 13, h: 46, rx: 5 } },
  { part: "foot-r", side: "r", front: "Right ankle / foot", back: "Right heel / Achilles", box: { x: 42, y: 216, w: 16, h: 20, rx: 5 } },
  { part: "foot-l", side: "l", front: "Left ankle / foot", back: "Left heel / Achilles", box: { x: 62, y: 216, w: 16, h: 20, rx: 5 } },
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

export const CHARACTER = ["Sharp", "Dull ache", "Burning", "Throbbing", "Stabbing", "Shooting", "Tingling", "Stiffness", "Cramping"];
export const WORSE_TIMES = ["Morning", "Afternoon", "Evening", "Night"];
export const AGGRAVATING = [
  "Sitting",
  "Standing",
  "Walking",
  "Stairs",
  "Bending",
  "Lifting",
  "Twisting",
  "Lying down",
  "Getting up from a chair",
  "Reaching overhead",
  "Coughing / sneezing",
  "Cold weather",
];
export const EASING = ["Rest", "Movement", "Heat", "Ice", "Medication", "Lying down", "Stretching", "Massage"];
export const NERVE_SYMPTOMS = ["Pins and needles", "Numbness", "Weakness", "Electric-shock feeling"];
export const RED_FLAGS = [
  "Night pain not eased by rest or position",
  "Unexplained weight loss",
  "Fever or feeling generally unwell",
  "Bladder or bowel changes",
  "Numbness around the groin / saddle area",
  "Worsening weakness",
  "History of cancer",
  "Recent major fall or accident",
];

/** The 0–10 scores an assessment can hold, in display order. */
export const SCORES = [
  { key: "at_rest", label: "At rest" },
  { key: "on_activity", label: "On activity" },
  { key: "at_night", label: "At night" },
  { key: "worst_24h", label: "Worst (24 h)" },
  { key: "best_24h", label: "Best (24 h)" },
  { key: "before_session", label: "Before session" },
  { key: "after_session", label: "After session" },
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
  initial: "Initial assessment",
  reassessment: "Reassessment",
  session: "Session check",
  discharge: "At discharge",
};

/** "Rest 3 · Activity 6" — the scores that were recorded. */
export function scoreLine(a: Pick<PainAssessment, ScoreKey>): string {
  return SCORES.filter((s) => a[s.key] !== null)
    .map((s) => `${s.label} ${a[s.key]}`)
    .join(" · ");
}
