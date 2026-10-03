-- Patient details.
--   Personal: age, gender, address (for home visits) and an emergency contact.
--   Clinical: referring doctor, injury / surgery date, goals, precautions, and
--   an optional 0–10 pain score on each visit. (The existing "condition" field
--   holds the condition / diagnosis.)

alter table public.patients
  add column date_of_birth     date,
  add column dob_is_estimate   boolean not null default false,  -- true when only the age was given
  add column gender            text check (gender in ('female', 'male', 'other')),
  add column address           text,
  add column emergency_name    text,
  add column emergency_phone   text,
  add column referred_by       text,
  add column injury_date       date,                             -- injury or surgery date
  add column goals             text,
  add column precautions       text;                             -- shown as a pinned banner

alter table public.sessions
  add column pain_score smallint check (pain_score between 0 and 10);
