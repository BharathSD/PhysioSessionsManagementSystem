-- Days the clinic is closed every week (ISO weekdays: 1 = Mon … 7 = Sun), e.g. '{7}'
-- for Sundays. On those days nobody is expected and attendance isn't asked for.

alter table public.clinics
  add column closed_weekdays smallint[] not null default '{}'
    check (closed_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]);
