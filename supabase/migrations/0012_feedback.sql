-- Feedback from physios: problems, ideas, praise. Read by the app's makers in
-- the Supabase dashboard (Table Editor → feedback); physios see only their own.

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('problem', 'idea', 'praise')),
  message     text not null check (length(message) between 1 and 4000),
  reference   text check (length(reference) <= 200), -- e.g. the error code shown on an error screen
  user_agent  text check (length(user_agent) <= 400), -- phone / browser, to reproduce problems
  created_at  timestamptz not null default now()
);
create index on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy "members send feedback" on public.feedback
  for insert to authenticated with check (public.is_clinic_member(clinic_id) and user_id = auth.uid());
create policy "members read their own feedback" on public.feedback
  for select to authenticated using (user_id = auth.uid());

grant select, insert on public.feedback to authenticated;
