-- Patchy signal: the app resends a save whose answer got lost. These make a
-- resend harmless instead of recording a payment or visit twice.

-- Each form submission carries a one-off key; the first time a key is seen the
-- save goes ahead, a resend of the same submission is recognised and skipped.
create table public.request_keys (
  key        uuid primary key,
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.request_keys (clinic_id, created_at);

alter table public.request_keys enable row level security;
create policy "members record their requests" on public.request_keys
  for insert to authenticated with check (public.is_clinic_member(clinic_id));
create policy "members read their requests" on public.request_keys
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "members clear old requests" on public.request_keys
  for delete to authenticated using (public.is_clinic_member(clinic_id));

-- One visit per patient per day (the app already checks; this also covers two
-- physios marking the same patient at the same moment). Skipped, with a notice,
-- if a clinic already has such a duplicate — the app shows both so it can be removed.
do $$
begin
  if exists (select 1 from public.sessions group by patient_id, session_date having count(*) > 1) then
    raise notice 'Some patients have two visits on one day; one-visit-per-day rule not added. Remove the extra visit and run this statement again.';
  else
    create unique index sessions_one_per_day on public.sessions (patient_id, session_date);
  end if;
end;
$$;

grant select, insert, delete on public.request_keys to authenticated;
