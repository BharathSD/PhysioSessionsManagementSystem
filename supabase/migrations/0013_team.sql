-- Clinics with several physios: roles, invite links, who recorded what, and a
-- main physio per patient. A solo physio is still a clinic of one.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create function public.is_clinic_owner(target_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members
    where clinic_id = target_clinic and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Members may edit their own name and title, never their role (that would let a
-- physio make themselves owner). Roles change only through set_member_role().
revoke update on public.clinic_members from authenticated;
grant update (display_name, designation) on public.clinic_members to authenticated;

-- Clinic-wide settings are the owner's: visit types, the clinic's standard fees,
-- and days the whole clinic is closed. Everyone works with patients — including
-- a patient's own fees and days off.
drop policy "members manage visit types" on public.visit_types;
create policy "members read visit types" on public.visit_types
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "owners manage visit types" on public.visit_types
  for all to authenticated using (public.is_clinic_owner(clinic_id)) with check (public.is_clinic_owner(clinic_id));

drop policy "members manage rates" on public.rates;
create policy "members read rates" on public.rates
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "members manage patient fees" on public.rates
  for all to authenticated
  using (public.is_clinic_member(clinic_id) and patient_id is not null)
  with check (public.is_clinic_member(clinic_id) and patient_id is not null);
create policy "owners manage clinic fees" on public.rates
  for all to authenticated using (public.is_clinic_owner(clinic_id)) with check (public.is_clinic_owner(clinic_id));

drop policy "members manage days off" on public.days_off;
create policy "members read days off" on public.days_off
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "members manage patient days off" on public.days_off
  for all to authenticated
  using (public.is_clinic_member(clinic_id) and patient_id is not null)
  with check (public.is_clinic_member(clinic_id) and patient_id is not null);
create policy "owners manage clinic days off" on public.days_off
  for all to authenticated using (public.is_clinic_owner(clinic_id)) with check (public.is_clinic_owner(clinic_id));

-- ---------------------------------------------------------------------------
-- Invite links: /join/<token>, single use, valid 7 days
-- ---------------------------------------------------------------------------

create table public.clinic_invites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  role        text not null default 'physio' check (role in ('owner', 'physio')),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references auth.users (id) on delete set null,
  used_at     timestamptz
);
create index on public.clinic_invites (clinic_id);

alter table public.clinic_invites enable row level security;
create policy "owners manage invites" on public.clinic_invites
  for all to authenticated using (public.is_clinic_owner(clinic_id)) with check (public.is_clinic_owner(clinic_id));
grant select, insert, delete on public.clinic_invites to authenticated;

/** What the join page shows before anyone signs in: which clinic, invited by whom. */
create function public.invite_info(invite_token text)
returns table (clinic_name text, invited_by text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, trim(coalesce(m.designation, '') || ' ' || coalesce(m.display_name, '')), i.role
  from public.clinic_invites i
  join public.clinics c on c.id = i.clinic_id
  left join public.clinic_members m on m.clinic_id = i.clinic_id and m.user_id = i.created_by
  where i.token = invite_token and i.used_at is null and i.expires_at > now();
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Sign-up: with a valid invite, join that clinic; otherwise start a clinic of one (as before).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_clinic_id uuid;
  physio_name   text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  title         text := coalesce(new.raw_user_meta_data ->> 'designation', '');
  typed         text[] := regexp_match(physio_name, '^(dr|prof|mrs|mr|ms)\.?\s+(\S.*)$', 'i');
  invite        public.clinic_invites;
begin
  if typed is not null then
    physio_name := typed[2];
    if title = '' then title := initcap(lower(typed[1])) || '.'; end if;
  end if;
  if title not in ('Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.') then title := ''; end if;

  select * into invite from public.clinic_invites
  where token = new.raw_user_meta_data ->> 'invite' and used_at is null and expires_at > now()
  for update;
  if found then
    insert into public.clinic_members (clinic_id, user_id, role, display_name, designation)
    values (invite.clinic_id, new.id, invite.role, physio_name, title);
    update public.clinic_invites set used_by = new.id, used_at = now() where id = invite.id;
    return new;
  end if;

  insert into public.clinics (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'clinic_name', ''), physio_name || '''s Physio'))
  returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, display_name, designation)
  values (new_clinic_id, new.id, 'owner', physio_name, title);

  return new;
end;
$$;

/**
 * An existing account accepts an invite. Their own practice is given up only if
 * it's empty (no patients, nobody else in it); otherwise joining is refused, so
 * no records are ever lost or left behind.
 */
create function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  invite public.clinic_invites;
  name   text;
  title  text;
begin
  if me is null then raise exception 'Sign in first.'; end if;

  select * into invite from public.clinic_invites
  where token = invite_token and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'This invite link has expired or was already used. Ask the clinic for a new one.';
  end if;
  if exists (select 1 from public.clinic_members where clinic_id = invite.clinic_id and user_id = me) then
    return invite.clinic_id;
  end if;
  if exists (
    select 1 from public.clinic_members m
    where m.user_id = me
      and (exists (select 1 from public.patients p where p.clinic_id = m.clinic_id)
           or exists (select 1 from public.clinic_members o where o.clinic_id = m.clinic_id and o.user_id <> me))
  ) then
    raise exception 'Your account already has its own practice with patients. Join with a different email, or contact support to combine them.';
  end if;

  select m.display_name, m.designation into name, title from public.clinic_members m where m.user_id = me limit 1;
  if name is null then
    select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)), '' into name, title
    from auth.users u where u.id = me;
  end if;

  delete from public.clinics where id in (select clinic_id from public.clinic_members where user_id = me);
  insert into public.clinic_members (clinic_id, user_id, role, display_name, designation)
  values (invite.clinic_id, me, invite.role, name, coalesce(title, ''));
  update public.clinic_invites set used_by = me, used_at = now() where id = invite.id;
  return invite.clinic_id;
end;
$$;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Changing the team (owners), leaving, starting over
-- ---------------------------------------------------------------------------

create function public.set_member_role(target_clinic uuid, target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_clinic_owner(target_clinic) then raise exception 'Only a clinic owner can change roles.'; end if;
  if new_role not in ('owner', 'physio') then raise exception 'Unknown role.'; end if;
  if new_role = 'physio' and not exists (
    select 1 from public.clinic_members where clinic_id = target_clinic and role = 'owner' and user_id <> target_user
  ) then
    raise exception 'The clinic needs at least one owner. Make someone else an owner first.';
  end if;
  update public.clinic_members set role = new_role where clinic_id = target_clinic and user_id = target_user;
end;
$$;

create function public.remove_member(target_clinic uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_clinic_owner(target_clinic) then raise exception 'Only a clinic owner can remove people.'; end if;
  if target_user = auth.uid() then raise exception 'To remove yourself, use Leave clinic.'; end if;
  delete from public.clinic_members where clinic_id = target_clinic and user_id = target_user;
end;
$$;

create function public.leave_clinic(target_clinic uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.clinic_members where clinic_id = target_clinic and user_id = auth.uid()) then
    return;
  end if;
  if not exists (select 1 from public.clinic_members where clinic_id = target_clinic and user_id <> auth.uid()) then
    raise exception 'You''re the only one in this clinic, so you can''t leave it.';
  end if;
  if not exists (
    select 1 from public.clinic_members where clinic_id = target_clinic and role = 'owner' and user_id <> auth.uid()
  ) then
    raise exception 'Make someone else an owner before you leave.';
  end if;
  delete from public.clinic_members where clinic_id = target_clinic and user_id = auth.uid();
end;
$$;

/** For someone who left (or was removed from) a clinic: a fresh practice of their own. */
create function public.start_own_practice()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me            uuid := auth.uid();
  new_clinic_id uuid;
  name          text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select clinic_id into new_clinic_id from public.clinic_members where user_id = me limit 1;
  if found then return new_clinic_id; end if;

  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) into name
  from auth.users u where u.id = me;
  insert into public.clinics (name) values (name || '''s Physio') returning id into new_clinic_id;
  insert into public.clinic_members (clinic_id, user_id, role, display_name) values (new_clinic_id, me, 'owner', name);
  return new_clinic_id;
end;
$$;

grant execute on function public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.leave_clinic(uuid), public.start_own_practice() to authenticated;

-- ---------------------------------------------------------------------------
-- Who recorded visits and payments; each patient's main physio
-- ---------------------------------------------------------------------------

alter table public.sessions add column recorded_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.payments add column recorded_by uuid default auth.uid() references auth.users (id) on delete set null;

-- Must be a member of the patient's clinic; if they leave, the patient is simply unassigned.
alter table public.patients
  add column physio_id uuid default auth.uid(), -- whoever adds the patient, unless someone else is picked
  add constraint patients_physio_member foreign key (clinic_id, physio_id)
    references public.clinic_members (clinic_id, user_id) on delete set null (physio_id);
create index on public.patients (clinic_id, physio_id);

-- Every clinic so far has one physio: their patients are theirs.
update public.patients p
set physio_id = m.user_id
from public.clinic_members m
where m.clinic_id = p.clinic_id and m.role = 'owner';

-- Same view as 0009, with the main physio added at the end.
create or replace view public.patient_summary
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
  s.last_visit,
  p.title,
  p.physio_id
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
