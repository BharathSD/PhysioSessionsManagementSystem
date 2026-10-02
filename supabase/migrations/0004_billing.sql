-- Billing as a ledger.
--   * Visit types (In-clinic, Home visit, Online, Assessment, + custom).
--   * Fees are dated: each fee has an effective_from date, clinic-wide or per
--     patient. When a visit is recorded, the fee in force on that day is copied
--     onto the visit (sessions.charge), so later fee changes never alter past bills.
--   * Attendance: present / absent / cancelled by patient / cancelled by clinic.
--     Absences and patient cancellations can optionally be charged.
--   * Extra charges and discounts (charges table).
--   * Balance = packages + visit charges + extra charges − payments.

-- ---------------------------------------------------------------------------
-- Visit types
-- ---------------------------------------------------------------------------

create table public.visit_types (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  name        text not null,
  sort        smallint not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, name)
);

create function public.seed_visit_types(target_clinic uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.visit_types (clinic_id, name, sort) values
    (target_clinic, 'In-clinic session', 1),
    (target_clinic, 'Home visit', 2),
    (target_clinic, 'Online session', 3),
    (target_clinic, 'Assessment', 4)
  on conflict (clinic_id, name) do nothing;
$$;

select public.seed_visit_types(id) from public.clinics;

create function public.on_clinic_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_visit_types(new.id);
  return new;
end;
$$;

create trigger on_clinic_created
  after insert on public.clinics
  for each row execute function public.on_clinic_created();

-- ---------------------------------------------------------------------------
-- Dated fees. patient_id null = clinic standard. For a patient row, a null
-- amount means "back to the clinic standard from this date".
-- ---------------------------------------------------------------------------

create table public.rates (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid,
  kind            text not null check (kind in ('visit', 'no_show', 'cancellation')),
  visit_type_id   uuid,
  amount          numeric(10, 2) check (amount >= 0),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  foreign key (visit_type_id, clinic_id) references public.visit_types (id, clinic_id) on delete cascade,
  check ((kind = 'visit') = (visit_type_id is not null)),
  check (amount is not null or patient_id is not null)
);

create unique index rates_one_per_day on public.rates (
  clinic_id,
  coalesce(patient_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind,
  coalesce(visit_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
  effective_from
);

-- ---------------------------------------------------------------------------
-- Visit type on patients (their usual type), packages, visits, bookings and
-- schedules (with optional per-weekday overrides for mixed schedules).
-- ---------------------------------------------------------------------------

alter table public.patients
  add column default_visit_type_id uuid,
  add foreign key (default_visit_type_id, clinic_id)
    references public.visit_types (id, clinic_id) on delete set null (default_visit_type_id);

alter table public.packages
  add column visit_type_id uuid,  -- null = any visit type
  add foreign key (visit_type_id, clinic_id)
    references public.visit_types (id, clinic_id) on delete set null (visit_type_id);

alter table public.schedules
  add column visit_type_id uuid,
  add column day_visit_types jsonb not null default '{}'::jsonb,  -- {"6": "<visit type id>"} = Saturdays differ
  add foreign key (visit_type_id, clinic_id)
    references public.visit_types (id, clinic_id) on delete set null (visit_type_id);

alter table public.sessions
  add column visit_type_id uuid,
  add column charge numeric(10, 2) not null default 0,  -- copied from the fee in force that day
  add unique (id, clinic_id),
  add foreign key (visit_type_id, clinic_id)
    references public.visit_types (id, clinic_id) on delete set null (visit_type_id);

alter table public.sessions drop constraint sessions_status_check;
update public.sessions set status = 'cancelled_clinic' where status = 'cancelled';
alter table public.sessions
  add constraint sessions_status_check
  check (status in ('attended', 'missed', 'cancelled_patient', 'cancelled_clinic'));

alter table public.appointments
  add column visit_type_id uuid,
  add column rescheduled_from uuid,
  add foreign key (visit_type_id, clinic_id)
    references public.visit_types (id, clinic_id) on delete set null (visit_type_id),
  add foreign key (rescheduled_from, clinic_id)
    references public.sessions (id, clinic_id) on delete set null (rescheduled_from);

-- ---------------------------------------------------------------------------
-- Extra charges and discounts (negative amount = discount / write-off).
-- ---------------------------------------------------------------------------

create table public.charges (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  charge_date  date not null,
  description  text not null,
  amount       numeric(10, 2) not null check (amount <> 0),
  created_at   timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade
);

create index on public.charges (patient_id);
create index on public.rates (clinic_id, kind);
create index on public.visit_types (clinic_id);

-- ---------------------------------------------------------------------------
-- Move existing data over. Everything so far was in-clinic. The old single
-- per-visit fee becomes the patient's own in-clinic fee, and visits beyond
-- their packages get that fee stored as their charge (balances don't change).
-- ---------------------------------------------------------------------------

update public.patients p set default_visit_type_id = vt.id
from public.visit_types vt where vt.clinic_id = p.clinic_id and vt.name = 'In-clinic session';

update public.sessions s set visit_type_id = vt.id
from public.visit_types vt where vt.clinic_id = s.clinic_id and vt.name = 'In-clinic session';

update public.schedules s set visit_type_id = vt.id
from public.visit_types vt where vt.clinic_id = s.clinic_id and vt.name = 'In-clinic session';

insert into public.rates (clinic_id, patient_id, kind, visit_type_id, amount, effective_from)
select p.clinic_id, p.id, 'visit', vt.id, p.rate_per_session, date '2000-01-01'
from public.patients p
join public.visit_types vt on vt.clinic_id = p.clinic_id and vt.name = 'In-clinic session'
where p.rate_per_session is not null;

update public.sessions set package_id = null where status <> 'attended';

with capacity as (
  select patient_id,
         sum(total_sessions) - sum(sessions_used_before) as free_sessions,
         (array_agg(id order by start_date, created_at))[1] as first_package
  from public.packages group by patient_id
),
ranked as (
  select id, patient_id, row_number() over (partition by patient_id order by session_date, created_at) as n
  from public.sessions where status = 'attended'
)
update public.sessions s set
  package_id = case when r.n <= coalesce(c.free_sessions, 0) then coalesce(s.package_id, c.first_package) end,
  charge     = case when r.n <= coalesce(c.free_sessions, 0) then 0 else coalesce(p.rate_per_session, 0) end
from ranked r
join public.patients p on p.id = r.patient_id
left join capacity c on c.patient_id = r.patient_id
where s.id = r.id;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.visit_types enable row level security;
alter table public.rates       enable row level security;
alter table public.charges     enable row level security;

create policy "members manage visit types" on public.visit_types
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage rates" on public.rates
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage charges" on public.charges
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

revoke all on public.visit_types, public.rates, public.charges from anon;
grant select, insert, update, delete on public.visit_types, public.rates, public.charges to authenticated;

-- ---------------------------------------------------------------------------
-- Balance view (replaces the old one; rate_per_session is now in rates).
--   sessions_used  = package sessions used (incl. before the app)
--   visits         = all attended visits (incl. before the app)
--   amount_due < 0 = paid in advance
-- ---------------------------------------------------------------------------

drop view public.patient_summary;
alter table public.patients drop column rate_per_session;

create view public.patient_summary
with (security_invoker = on) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.phone,
  p.condition,
  p.archived,
  p.default_visit_type_id,
  p.created_at,
  coalesce(pk.bought, 0)::int                                           as sessions_bought,
  (coalesce(pk.prior, 0) + coalesce(s.covered, 0))::int                 as sessions_used,
  (coalesce(pk.bought, 0) - coalesce(pk.prior, 0) - coalesce(s.covered, 0))::int as sessions_left,
  (coalesce(pk.prior, 0) + coalesce(s.attended, 0))::int                as visits,
  coalesce(pk.prior, 0)::int                                            as sessions_prior,
  t.amount_billed,
  t.amount_paid,
  (t.amount_billed - t.amount_paid)::numeric                            as amount_due,
  s.last_visit
from public.patients p
left join (
  select patient_id, sum(total_sessions) as bought, sum(sessions_used_before) as prior, sum(price) as price
  from public.packages group by patient_id
) pk on pk.patient_id = p.id
left join (
  select patient_id,
         count(*) filter (where package_id is not null)            as covered,
         count(*) filter (where status = 'attended')               as attended,
         sum(charge)                                               as charged,
         max(session_date) filter (where status = 'attended')      as last_visit
  from public.sessions group by patient_id
) s on s.patient_id = p.id
left join (
  select patient_id, sum(amount) as extra from public.charges group by patient_id
) ch on ch.patient_id = p.id
left join (
  select patient_id, sum(amount) as paid from public.payments group by patient_id
) pay on pay.patient_id = p.id
cross join lateral (
  select
    (coalesce(pk.price, 0) + coalesce(s.charged, 0) + coalesce(ch.extra, 0))::numeric as amount_billed,
    coalesce(pay.paid, 0)::numeric                                                    as amount_paid
) t;

grant select on public.patient_summary to authenticated;
