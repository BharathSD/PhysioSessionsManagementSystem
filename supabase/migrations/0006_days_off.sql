-- Days off, cancelled in advance.
--   * patient_id null  = the clinic is closed / physio away (affects everyone)
--   * patient_id set   = one patient can't come (a single day or a break)
-- Nothing is created for the cancelled days themselves: schedules and bookings
-- are simply not expected on them, so removing a day off brings them back.

create table public.days_off (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid,
  from_date     date not null,
  to_date       date not null,
  cancelled_by  text not null check (cancelled_by in ('clinic', 'patient')),
  reason        text,
  created_at    timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade,
  check (to_date >= from_date),
  check (patient_id is not null or cancelled_by = 'clinic')
);

create index on public.days_off (clinic_id, from_date, to_date);
create index on public.days_off (patient_id);

-- Which patients have been told about a clinic closure (the ✓ on the notify screen).
create table public.day_off_notices (
  day_off_id   uuid not null,
  clinic_id    uuid not null,
  patient_id   uuid not null,
  notified_at  timestamptz not null default now(),
  primary key (day_off_id, patient_id),
  foreign key (day_off_id, clinic_id) references public.days_off (id, clinic_id) on delete cascade,
  foreign key (patient_id, clinic_id) references public.patients (id, clinic_id) on delete cascade
);

alter table public.days_off        enable row level security;
alter table public.day_off_notices enable row level security;

create policy "members manage days off" on public.days_off
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
create policy "members manage day off notices" on public.day_off_notices
  for all to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

revoke all on public.days_off, public.day_off_notices from anon;
grant select, insert, update, delete on public.days_off, public.day_off_notices to authenticated;
