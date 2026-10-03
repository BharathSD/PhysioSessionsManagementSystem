-- A designation (Dr., Prof., Mr., Ms., Mrs.) shown before the physio's name:
-- "Dr. Priya Sharma" on receipts, "Good morning, Dr. Priya" on Home.
-- Kept apart from the name so it can be changed on its own.

alter table public.clinic_members
  add column designation text not null default ''
    check (designation in ('', 'Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.'));

-- Existing names typed as "Dr. Priya" / "dr priya": move the title into the new column.
with parsed as (
  select clinic_id, user_id, regexp_match(display_name, '^(dr|prof|mrs|mr|ms)\.?\s+(\S.*)$', 'i') as r
  from public.clinic_members
)
update public.clinic_members m
set designation  = initcap(lower(p.r[1])) || '.',
    display_name = p.r[2]
from parsed p
where p.r is not null
  and m.clinic_id = p.clinic_id
  and m.user_id = p.user_id;

-- Sign-up: take the designation from the form, or from the front of the name if it was typed there.
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
begin
  if typed is not null then
    physio_name := typed[2];
    if title = '' then title := initcap(lower(typed[1])) || '.'; end if;
  end if;
  if title not in ('Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.') then title := ''; end if;

  insert into public.clinics (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'clinic_name', ''), physio_name || '''s Physio'))
  returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, display_name, designation)
  values (new_clinic_id, new.id, 'owner', physio_name, title);

  return new;
end;
$$;
