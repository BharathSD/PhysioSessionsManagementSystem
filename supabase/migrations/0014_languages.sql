-- Languages: the app's language for each physio (follows them to any phone they
-- sign in on), and the language of each patient's WhatsApp messages.
-- Language codes as in src/i18n ('en', 'hi', …).

alter table public.clinic_members
  add column language text not null default 'en' check (language ~ '^[a-z]{2}$');
grant update (language) on public.clinic_members to authenticated;

alter table public.patients
  add column language text not null default 'en' check (language ~ '^[a-z]{2}$');

-- Same view as 0013, with the patient's message language added at the end.
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
  p.physio_id,
  p.language
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
