-- Fuller patient contact details:
--   * address in parts (line 1 stays in `address`), plus an optional map pin for home visits
--   * a title for the referring doctor ("Dr." Mehta)
--   * a title and relationship for the emergency contact ("Mrs." Anita, wife)

alter table public.patients
  add column address_line2       text,
  add column city                text,
  add column state               text,
  add column postal_code         text,
  add column address_country     text check (address_country ~ '^[A-Z]{2}$'),
  add column latitude            double precision check (latitude between -90 and 90),
  add column longitude           double precision check (longitude between -180 and 180),
  add column referred_by_title   text not null default ''
    check (referred_by_title in ('', 'Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.')),
  add column emergency_title     text not null default ''
    check (emergency_title in ('', 'Mr.', 'Mrs.', 'Ms.', 'Master', 'Baby', 'Dr.', 'Prof.')),
  add column emergency_relation  text,
  add constraint patients_pin_complete check ((latitude is null) = (longitude is null));

-- Titles typed into the names before: "Dr. Mehta, orthopaedic surgeon", "Mrs. Anita".
with parsed as (
  select id,
         regexp_match(referred_by, '^(dr|prof|mrs|mr|ms)\.?\s+(\S.*)$', 'i')    as ref,
         regexp_match(emergency_name, '^(dr|prof|mrs|mr|ms)\.?\s+(\S.*)$', 'i') as em
  from public.patients
  where referred_by is not null or emergency_name is not null
)
update public.patients p
set referred_by_title = coalesce(initcap(lower(x.ref[1])) || '.', p.referred_by_title),
    referred_by       = coalesce(x.ref[2], p.referred_by),
    emergency_title   = coalesce(initcap(lower(x.em[1])) || '.', p.emergency_title),
    emergency_name    = coalesce(x.em[2], p.emergency_name)
from parsed x
where p.id = x.id and (x.ref is not null or x.em is not null);

-- "Anita (wife)" → name Anita, relationship wife.
update public.patients
set emergency_relation = substring(emergency_name from '\(([^()]+)\)\s*$'),
    emergency_name     = trim(regexp_replace(emergency_name, '\s*\([^()]+\)\s*$', ''))
where emergency_relation is null
  and emergency_name ~ '\S\s*\([^()]+\)\s*$';
