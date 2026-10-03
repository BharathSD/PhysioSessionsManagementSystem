-- An optional title before a patient's name (Mr., Mrs., Ms., Master, Baby, Dr., Prof.),
-- kept apart from the name: "Mrs. Lakshmi Iyer" in the app and on WhatsApp messages.

alter table public.patients
  add column title text not null default ''
    check (title in ('', 'Mr.', 'Mrs.', 'Ms.', 'Master', 'Baby', 'Dr.', 'Prof.'));

-- Names typed as "Mr. Rahul Sharma" before this existed: move the title out.
with parsed as (
  select id, regexp_match(name, '^(mrs|mr|ms|dr|prof)\.?\s+(\S.*)$', 'i') as r
  from public.patients
)
update public.patients p
set title = initcap(lower(x.r[1])) || '.',
    name  = x.r[2]
from parsed x
where x.r is not null and p.id = x.id;

-- Same view as 0004, with the title added at the end.
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
  p.title
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
