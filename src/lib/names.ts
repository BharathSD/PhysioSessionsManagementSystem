import type { Member } from "./types";

/** Titles a physio can put before their name. Must match the check on clinic_members.designation. */
export const DESIGNATIONS = ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."] as const;
export type Designation = (typeof DESIGNATIONS)[number] | "";

/** Titles for patients. Must match the check on patients.title. */
export const PATIENT_TITLES = ["Mr.", "Mrs.", "Ms.", "Master", "Baby", "Dr.", "Prof."] as const;

export const isDesignation = (v: string): v is Designation => v === "" || (DESIGNATIONS as readonly string[]).includes(v);
export const isPatientTitle = (v: string) => v === "" || (PATIENT_TITLES as readonly string[]).includes(v);

/**
 * Splits a title typed at the front of a name:
 * "Dr. Priya Sharma" / "dr priya sharma" → { designation: "Dr.", name: "Priya Sharma" }.
 * Only the dotted titles (Dr., Prof., Mr., Ms., Mrs.) — "Master" and "Baby" can be real first names.
 */
export function splitDesignation(full: string): { designation: Designation; name: string } {
  const m = full.trim().match(/^(dr|prof|mrs|mr|ms)\.?\s+(\S.*)$/i);
  if (!m) return { designation: "", name: full.trim() };
  const t = m[1].toLowerCase();
  return { designation: `${t[0].toUpperCase()}${t.slice(1)}.` as Designation, name: m[2] };
}

const withTitle = (title: string | null | undefined, name: string) => [title, name].filter(Boolean).join(" ");

type Named = Pick<Member, "designation" | "display_name">;

/** Full name with designation, for receipts and the profile: "Dr. Priya Sharma". */
export const physioName = (m: Named) => withTitle(m.designation, m.display_name);

/** How Home greets them: "Dr. Priya", or just "Priya". */
export const greetingName = (m: Named) => withTitle(m.designation, m.display_name.split(/\s+/)[0]);

/** A patient's name with their title: "Mrs. Lakshmi Iyer". */
export const patientName = (p: { title?: string | null; name: string }) => withTitle(p.title, p.name);
