-- PhysioSessionsTracker — initial schema
--
-- Everything belongs to a clinic. A solo physio is simply a clinic with one
-- member, so moving to multi-physio clinics later needs no data migration.
-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  upi_id      text,                                   -- e.g. priya@okhdfc, shown on receipts
  currency    text not null default 'INR',
  timezone    text not null default 'Asia/Kolkata',
  created_at  timestamptz not null default now()
);

create table public.clinic_members (
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'physio' check (role in ('owner', 'physio')),
  display_name  text not null,
  created_at    timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

create table public.patients (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  name        text not null,
  phone       text,                                   -- E.164, e.g. +919876543210; future patient login identity
  condition   text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, phone)
);

-- A package is a block of sessions sold to a patient (e.g. 10 sessions for ₹5,000).
create table public.packages (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null,
  patient_id      uuid not null,
  title           text not null default 'Sessions',
  total_sessions  int  not null check (total_sessions > 0),
  price           numeric(10, 2) not null default 0 check (price >= 0),
  start_date      date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade
);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null,
  patient_id    uuid not null,
  package_id    uuid,
  physio_id     uuid not null default auth.uid() references auth.users (id),
  session_date  date not null,
  status        text not null check (status in ('attended', 'missed', 'cancelled')),
  notes         text,
  created_at    timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  foreign key (package_id, clinic_id) references public.packages (id, clinic_id) on delete set null (package_id)
);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null,
  patient_id  uuid not null,
  package_id  uuid,
  amount      numeric(10, 2) not null check (amount > 0),
  method      text not null default 'upi' check (method in ('upi', 'cash', 'card', 'bank', 'other')),
  paid_on     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  foreign key (package_id, clinic_id) references public.packages (id, clinic_id) on delete set null (package_id)
);

create index on public.clinic_members (user_id);
create index on public.patients (clinic_id) where not archived;
create index on public.packages (patient_id);
create index on public.sessions (patient_id, session_date desc);
create index on public.sessions (clinic_id, session_date);
create index on public.payments (patient_id);

-- ---------------------------------------------------------------------------
-- Per-patient balance: sessions bought vs attended, amount billed vs paid.
-- Only attended sessions use up a package; missed/cancelled do not.
-- ---------------------------------------------------------------------------

create view public.patient_summary
with (security_invoker = on) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.phone,
  p.condition,
  p.archived,
  p.created_at,
  coalesce(pk.sessions_bought, 0)::int                         as sessions_bought,
  coalesce(s.sessions_attended, 0)::int                        as sessions_attended,
  (coalesce(pk.sessions_bought, 0) - coalesce(s.sessions_attended, 0))::int as sessions_left,
  coalesce(pk.amount_billed, 0)::numeric                       as amount_billed,
  coalesce(pay.amount_paid, 0)::numeric                        as amount_paid,
  (coalesce(pk.amount_billed, 0) - coalesce(pay.amount_paid, 0))::numeric as amount_due,
  s.last_visit
from public.patients p
left join (
  select patient_id, sum(total_sessions) as sessions_bought, sum(price) as amount_billed
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
) pay on pay.patient_id = p.id;

-- ---------------------------------------------------------------------------
-- Row-level security: members only see their own clinic's data.
-- ---------------------------------------------------------------------------

create function public.is_clinic_member(target_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members
    where clinic_id = target_clinic and user_id = auth.uid()
  );
$$;

alter table public.clinics        enable row level security;
alter table public.clinic_members enable row level security;
alter table public.patients       enable row level security;
alter table public.packages       enable row level security;
alter table public.sessions       enable row level security;
alter table public.payments       enable row level security;

create policy "members read clinic" on public.clinics
  for select to authenticated using (public.is_clinic_member(id));
create policy "owners update clinic" on public.clinics
  for update to authenticated
  using (exists (select 1 from public.clinic_members m
                 where m.clinic_id = id and m.user_id = auth.uid() and m.role = 'owner'));

create policy "members read team" on public.clinic_members
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "members update own profile" on public.clinic_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members manage patients" on public.patients
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage packages" on public.packages
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage sessions" on public.sessions
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage payments" on public.payments
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.patient_summary to authenticated;

-- ---------------------------------------------------------------------------
-- On sign-up, give every new physio their own clinic (a clinic of one).
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_clinic_id uuid;
  physio_name   text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
begin
  insert into public.clinics (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'clinic_name', ''), physio_name || '''s Physio'))
  returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, display_name)
  values (new_clinic_id, new.id, 'owner', physio_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
