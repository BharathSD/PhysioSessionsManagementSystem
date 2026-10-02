-- Treatment plans, one-off bookings, pay-per-visit rate, clinic country.

-- ---------------------------------------------------------------------------
-- Clinic country: default for phone numbers (and later currency / timezone).
-- ---------------------------------------------------------------------------

alter table public.clinics
  add column country text not null default 'IN' check (country ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- Pay-per-visit rate. Attended sessions beyond what packages cover are billed
-- at this rate (covers both pay-per-visit patients and packages that ran out).
-- ---------------------------------------------------------------------------

alter table public.patients
  add column rate_per_session numeric(10, 2) check (rate_per_session >= 0);

-- ---------------------------------------------------------------------------
-- Treatment plans. A plan is never edited when rehab progresses: the current
-- one is ended and a new one starts, so the history of the plan is kept.
--   fixed_days: these weekdays, every N weeks       (Mon/Wed/Fri; every other Sat)
--   flexible:   K sessions every N weeks, any days  (2× a week; 1× a fortnight)
-- ---------------------------------------------------------------------------

create table public.schedules (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null,
  patient_id        uuid not null,
  mode              text not null check (mode in ('fixed_days', 'flexible')),
  weekdays          smallint[] not null default '{}',  -- ISO: 1 = Mon … 7 = Sun
  every_n_weeks     smallint not null default 1 check (every_n_weeks between 1 and 8),
  sessions_per_period smallint check (sessions_per_period between 1 and 14),
  valid_from        date not null,
  valid_until       date,
  note              text,
  created_at        timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  check (valid_until is null or valid_until >= valid_from),
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  check (
    (mode = 'fixed_days' and cardinality(weekdays) > 0)
    or (mode = 'flexible' and sessions_per_period is not null)
  )
);

create index on public.schedules (patient_id, valid_from desc);
create index on public.schedules (clinic_id) where valid_until is null;

-- ---------------------------------------------------------------------------
-- One-off bookings (extra session, moved session, first visit).
-- booked_on = the day the booking was made; scheduled_date = the session day.
-- ---------------------------------------------------------------------------

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null,
  patient_id      uuid not null,
  scheduled_date  date not null,
  booked_on       date not null default current_date,
  status          text not null default 'booked' check (status in ('booked', 'cancelled')),
  note            text,
  created_at      timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade
);

create index on public.appointments (clinic_id, scheduled_date);
create index on public.appointments (patient_id, scheduled_date);

-- A visit can record which booking it fulfilled (and so when it was booked).
alter table public.sessions
  add column appointment_id uuid,
  add foreign key (appointment_id, clinic_id)
    references public.appointments (id, clinic_id) on delete set null (appointment_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.schedules    enable row level security;
alter table public.appointments enable row level security;

create policy "members manage schedules" on public.schedules
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage appointments" on public.appointments
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

revoke all on public.schedules, public.appointments from anon;
grant select, insert, update, delete on public.schedules, public.appointments to authenticated;

-- ---------------------------------------------------------------------------
-- Balance view: now also bills extra visits at the patient's per-session rate.
-- ---------------------------------------------------------------------------

drop view public.patient_summary;

create view public.patient_summary
with (security_invoker = on) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.phone,
  p.condition,
  p.archived,
  p.rate_per_session,
  p.created_at,
  t.sessions_bought,
  t.sessions_attended,
  (t.sessions_bought - t.sessions_attended)::int                 as sessions_left,
  t.amount_billed,
  t.amount_paid,
  (t.amount_billed - t.amount_paid)::numeric                     as amount_due,
  s.last_visit
from public.patients p
left join (
  select patient_id, sum(total_sessions) as sessions_bought, sum(price) as package_total
  from public.packages group by patient_id
) pk on pk.patient_id = p.id
left join (
  select patient_id,
         count(*) filter (where status = 'attended') as sessions_attended,
         max(session_date) filter (where status = 'attended') as last_visit
  from public.sessions group by patient_id
) s on s.patient_id = p.id
left join (
  select patient_id, sum(amount) as amount_paid
  from public.payments group by patient_id
) pay on pay.patient_id = p.id
cross join lateral (
  select
    coalesce(pk.sessions_bought, 0)::int   as sessions_bought,
    coalesce(s.sessions_attended, 0)::int  as sessions_attended,
    coalesce(pay.amount_paid, 0)::numeric  as amount_paid,
    (coalesce(pk.package_total, 0)
      + greatest(coalesce(s.sessions_attended, 0) - coalesce(pk.sessions_bought, 0), 0)
        * coalesce(p.rate_per_session, 0))::numeric as amount_billed
) t;

grant select on public.patient_summary to authenticated;
