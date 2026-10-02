export type SessionStatus = "attended" | "missed" | "cancelled_patient" | "cancelled_clinic";
export type PaymentMethod = "upi" | "cash" | "card" | "bank" | "other";

export type Clinic = {
  id: string;
  name: string;
  phone: string | null;
  upi_id: string | null;
  country: string;
  currency: string;
  timezone: string;
};

export type Member = {
  clinic_id: string;
  user_id: string;
  role: "owner" | "physio";
  display_name: string;
};

export type PatientSummary = {
  id: string;
  clinic_id: string;
  name: string;
  phone: string | null;
  condition: string | null;
  archived: boolean;
  default_visit_type_id: string | null;
  sessions_bought: number;
  sessions_used: number; // package sessions used, incl. before the app
  sessions_left: number;
  visits: number; // all attended visits, incl. before the app
  sessions_prior: number;
  amount_billed: number;
  amount_paid: number;
  amount_due: number;
  last_visit: string | null;
};

export type Package = {
  id: string;
  patient_id: string;
  title: string;
  total_sessions: number;
  sessions_used_before: number;
  visit_type_id: string | null;
  price: number;
  start_date: string;
  created_at: string;
};

export type Session = {
  id: string;
  patient_id: string;
  package_id: string | null;
  appointment_id: string | null;
  visit_type_id: string | null;
  charge: number;
  session_date: string;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  patient_id: string;
  package_id: string | null;
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
};

export type Appointment = {
  id: string;
  patient_id: string;
  scheduled_date: string;
  booked_on: string;
  visit_type_id: string | null;
  rescheduled_from: string | null;
  status: "booked" | "cancelled";
  note: string | null;
};

export type VisitType = { id: string; name: string; sort: number; archived: boolean };

export type RateKind = "visit" | "no_show" | "cancellation";

export type Rate = {
  id: string;
  patient_id: string | null;
  kind: RateKind;
  visit_type_id: string | null;
  amount: number | null; // null on a patient row = back to the clinic standard
  effective_from: string;
};

export type Charge = { id: string; patient_id: string; charge_date: string; description: string; amount: number; created_at: string };
