-- Opening balances when moving from paper/Excel records: a package can carry
-- sessions that were used before the app, without inventing dates for them.

alter table public.packages
  add column sessions_used_before int not null default 0 check (sessions_used_before >= 0);

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
  t.sessions_prior,
  (t.sessions_bought - t.sessions_attended)::int                 as sessions_left,
  t.amount_billed,
  t.amount_paid,
  (t.amount_billed - t.amount_paid)::numeric                     as amount_due,
  s.last_visit
from public.patients p
left join (
  select patient_id,
         sum(total_sessions)       as sessions_bought,
         sum(sessions_used_before) as sessions_prior,
         sum(price)                as package_total
  from public.packages group by patient_id
) pk on pk.patient_id = p.id
left join (
  select patient_id,
         count(*) filter (where status = 'attended') as sessions_dated,
         max(session_date) filter (where status = 'attended') as last_visit
  from public.sessions group by patient_id
) s on s.patient_id = p.id
left join (
  select patient_id, sum(amount) as amount_paid
  from public.payments group by patient_id
) pay on pay.patient_id = p.id
cross join lateral (
  select coalesce(s.sessions_dated, 0) + coalesce(pk.sessions_prior, 0) as attended
) a
cross join lateral (
  select
    coalesce(pk.sessions_bought, 0)::int   as sessions_bought,
    a.attended::int                        as sessions_attended,  -- dated visits + used before the app
    coalesce(pk.sessions_prior, 0)::int    as sessions_prior,
    coalesce(pay.amount_paid, 0)::numeric  as amount_paid,
    (coalesce(pk.package_total, 0)
      + greatest(a.attended - coalesce(pk.sessions_bought, 0), 0) * coalesce(p.rate_per_session, 0))::numeric as amount_billed
) t;

grant select on public.patient_summary to authenticated;
