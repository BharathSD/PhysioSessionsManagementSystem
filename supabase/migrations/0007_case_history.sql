-- Case history: a patient can have several cases (courses of treatment) over
-- time. Each case holds the initial assessment, then everything done and
-- measured along the way, then a discharge summary. Pain assessments,
-- measurements and session records are never overwritten — each is a new row,
-- so the history is kept.

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------

create table public.cases (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null,
  patient_id         uuid not null,
  title              text not null,                 -- e.g. "Right knee — ACL reconstruction"
  opened_on          date not null,
  status             text not null default 'active' check (status in ('active', 'discharged')),
  -- Initial assessment (free text)
  chief_complaint    text,
  history            text,                          -- how it started / history of the present problem
  medical_history    text,                          -- past conditions, surgeries, medications, allergies
  findings           text,                          -- examination findings
  diagnosis          text,
  goals              text,
  plan               text,
  -- Discharge
  closed_on          date,
  discharge_summary  text,
  created_at         timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  check (closed_on is null or closed_on >= opened_on),
  check ((status = 'discharged') = (closed_on is not null))
);

create index on public.cases (patient_id, opened_on desc);

-- Visits belong to a case (set automatically when there's an active case).
alter table public.sessions
  add column case_id uuid,
  add foreign key (case_id, clinic_id) references public.cases (id, clinic_id) on delete set null (case_id);

create index on public.sessions (case_id);

-- ---------------------------------------------------------------------------
-- Pain assessments — a full assessment, or a quick check at a session.
-- ---------------------------------------------------------------------------

create table public.pain_assessments (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null,
  patient_id             uuid not null,
  case_id                uuid,
  session_id             uuid,
  assessed_on            date not null,
  kind                   text not null check (kind in ('initial', 'reassessment', 'session', 'discharge')),
  -- Intensity, 0–10 (any may be left out)
  at_rest                smallint check (at_rest between 0 and 10),
  on_activity            smallint check (on_activity between 0 and 10),
  at_night               smallint check (at_night between 0 and 10),
  worst_24h              smallint check (worst_24h between 0 and 10),
  best_24h               smallint check (best_24h between 0 and 10),
  before_session         smallint check (before_session between 0 and 10),
  after_session          smallint check (after_session between 0 and 10),
  -- Where (body-chart region keys), and how it feels / behaves
  locations              text[] not null default '{}',
  radiating              text[] not null default '{}',
  character              text[] not null default '{}',   -- sharp, dull ache, burning, …
  pattern                text check (pattern in ('constant', 'intermittent')),
  worse_times            text[] not null default '{}',   -- morning, evening, night
  morning_stiffness_min  smallint check (morning_stiffness_min >= 0),
  aggravating            text[] not null default '{}',
  easing                 text[] not null default '{}',
  onset                  text check (onset in ('sudden', 'gradual')),
  nerve_symptoms         text[] not null default '{}',   -- pins and needles, numbness, weakness
  red_flags              text[] not null default '{}',
  activities             jsonb not null default '[]',    -- [{ "name": "Climbing stairs", "score": 3 }] — 0 = can't, 10 = normal
  notes                  text,
  created_at             timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  foreign key (case_id, clinic_id) references public.cases (id, clinic_id) on delete set null (case_id),
  foreign key (session_id, clinic_id) references public.sessions (id, clinic_id) on delete set null (session_id)
);

create index on public.pain_assessments (patient_id, assessed_on desc);
create index on public.pain_assessments (case_id);

-- ---------------------------------------------------------------------------
-- Measurements (range of movement, strength, …) for progress charts.
-- ---------------------------------------------------------------------------

create table public.measurements (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  case_id      uuid,
  measured_on  date not null,
  name         text not null,            -- e.g. "Knee flexion (R)"
  value        numeric(8, 2) not null,
  unit         text,                     -- °, /5, cm, s, …
  notes        text,
  created_at   timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  foreign key (case_id, clinic_id) references public.cases (id, clinic_id) on delete set null (case_id)
);

create index on public.measurements (patient_id, name, measured_on);

-- ---------------------------------------------------------------------------
-- The clinic's own list of exercises and treatments, and what was done in
-- each session. Session rows copy the name and dosage, so renaming or hiding
-- a list item never changes what was recorded.
-- ---------------------------------------------------------------------------

create table public.exercise_library (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  kind        text not null check (kind in ('exercise', 'treatment')),
  name        text not null,
  dosage      text,                      -- usual dosage, e.g. "3 × 10" or "10 min"
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, kind, name)
);

create table public.session_items (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null,
  session_id  uuid not null,
  item_id     uuid,
  kind        text not null check (kind in ('exercise', 'treatment')),
  name        text not null,
  dosage      text,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (session_id, clinic_id) references public.sessions (id, clinic_id) on delete cascade,
  foreign key (item_id, clinic_id) references public.exercise_library (id, clinic_id) on delete set null (item_id)
);

create index on public.session_items (session_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cases            enable row level security;
alter table public.pain_assessments enable row level security;
alter table public.measurements     enable row level security;
alter table public.exercise_library enable row level security;
alter table public.session_items    enable row level security;

create policy "members manage cases" on public.cases
  for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage pain assessments" on public.pain_assessments
  for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage measurements" on public.measurements
  for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage exercise library" on public.exercise_library
  for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage session items" on public.session_items
  for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

revoke all on public.cases, public.pain_assessments, public.measurements, public.exercise_library, public.session_items from anon;
grant select, insert, update, delete
  on public.cases, public.pain_assessments, public.measurements, public.exercise_library, public.session_items
  to authenticated;
