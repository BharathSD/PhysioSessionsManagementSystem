# Physio Sessions

Track physiotherapy session packages, attendance and payments: a simple management app for solo physios, designed to grow into multi-physio clinics.

- **Today screen**: one tap to mark a patient ✓ attended or ✗ missed.
- **WhatsApp receipts**: after marking, one tap opens WhatsApp with a ready-made message ("✅ Session 7 of 10 done, 3 left, ₹1,500 due"). It uses free click-to-chat links, so there's no WhatsApp API or TRAI/DLT setup.
- **Billing as a ledger**: packages, visit fees, extra charges and discounts minus payments, with a running balance per patient (overpayments show as advance).
- **Visit types & dated fees**: In-clinic, Home visit, Online, Assessment (+ your own). Fees have an "applies from" date, clinic-wide or per patient; the fee in force on the visit's day is saved on the visit, so price changes never alter past bills.
- **Attendance outcomes**: Present, Absent, Cancelled by patient, Cancelled by clinic. Absences and patient cancellations can be charged (a package session if left, else the no-show / cancellation fee) and rescheduled in one step.
- **Treatment plans**: fixed days (Mon/Wed/Fri, every 1–4 weeks, optionally a different visit type per day) or flexible (N sessions every 1–4 weeks). Changing a plan keeps the old one in history. The app also shows the next session and when the package will run out.
- **Bookings**: one-off sessions with both the session date and the date it was booked.
- **Moving from paper/Excel**: "Existing patient" mode records the current package (with its real start date), sessions already used (no dates needed), every past payment with its date, and past visits tapped on a calendar.
- **Date fields**: type a date (`02/10/2026`, `2/10`, `02102026`, `today`), pick it from a calendar, or tap a shortcut.
- **Phone numbers**: country picker (clinic's country by default), stored in international format.
- **Case history**: one case per problem — free-text initial assessment, pain assessments with a tap-to-mark body chart (each kept as history), measurements with progress charts, exercises/treatments/notes per session ("same as last time"), timeline, discharge summary.
- **Clinic teams**: invite physios with a one-time link (`/join/…`). Owners manage fees, visit types, clinic days off and the team; everyone works with all the clinic's patients, with a "My patients / Everyone" filter, a main physio per patient, and who recorded each visit and payment. A solo physio is a team of one.
- **Hindi** (and room for more languages): each physio picks the app's language (saved to their profile, so it follows them to any phone); each patient gets WhatsApp messages in their own language. See `src/i18n/` — adding a language is one dictionary file; `npm test` fails if any text is missing a translation.
- **Weak signal**: a save made without signal waits and goes through when it's back (Next.js `experimental.useOffline`), with an offline banner and "Waiting for signal…" buttons; a resent save is recognised so nothing is recorded twice. Opening the app with no signal shows a friendly page (a small service worker; nothing with patient data is cached).
- **Help & feedback**: report a problem (error screens link to it), suggest an idea, or chat on WhatsApp with support. Feedback lands in the `feedback` table.
- **Installable PWA** for Android, iPhone and desktop from a single codebase.

Stack: Next.js 16 (App Router, server actions), Tailwind CSS 4, Supabase (Postgres, Auth, row-level security).

## Setup

1. **Create a Supabase project** (free tier) at [supabase.com](https://supabase.com). Mumbai (`ap-south-1`) is the closest region to India.
2. **Create the database**: in the Supabase dashboard, open **SQL Editor** and run each file in [supabase/migrations/](supabase/migrations/) **in order** (`0001_…`, then `0002_…`, …). When a new migration is added later, run just that file.
3. **Configure auth URLs**: under **Authentication → URL Configuration**, set *Site URL* to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to *Redirect URLs*. When you deploy, add the production URL too.
   - Optional, for local testing: turn off **Authentication → Sign In / Providers → Email → Confirm email** so new accounts can sign in immediately.
4. **Environment variables**:
   ```bash
   cp .env.example .env.local
   # fill in values from Project Settings → API (project URL + publishable key)
   # optional: NEXT_PUBLIC_SUPPORT_WHATSAPP=919876543210 shows a "Chat with us on WhatsApp" button
   ```
5. **Run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 and create an account. Your clinic is created automatically.

To try it on your phone over Wi-Fi, run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer-ip>:3000`. Installing to the home screen needs HTTPS, so do that from a deployed URL (Vercel works out of the box).

## Data model

```
clinics ──< clinic_members >── auth.users        (a solo physio = clinic of one)
   ├──< visit_types        (In-clinic, Home visit, Online, Assessment, + your own)
   ├──< rates              (dated fees: clinic standard or per patient; no-show / cancellation fees)
   ├──< days_off ──< day_off_notices   (clinic closures and who's been told)
   ├──< exercise_library   (the clinic's own exercises and treatments)
   └──< patients ──< packages       (10 sessions for ₹5,000; optionally one visit type)
                 ├──< schedules      (fixed days or flexible; valid_from → valid_until; per-day visit types)
                 ├──< appointments   (one-off bookings: scheduled_date, booked_on)
                 ├──< cases          (initial assessment → discharge summary; one per problem)
                 │      ├──< pain_assessments  (body chart, scores, character, triggers, red flags, activities — each kept)
                 │      └──< measurements      (range of movement, strength … over time)
                 ├──< sessions       (outcome, visit type, charge saved on the day, pain score, case)
                 │      └──< session_items     (exercises / treatments done, name + dosage as recorded)
                 ├──< charges        (extra charges and discounts)
                 ├──< payments       (amount, method, paid_on)
                 └──< days_off       (one patient's cancelled days / breaks)

patient_summary (view): sessions_bought / used / left, visits,
                        amount_billed, amount_paid, amount_due (< 0 = advance), last_visit
```

Every table carries `clinic_id`, and RLS restricts each user to clinics they belong to. Composite foreign keys stop a row from pointing at another clinic's patient. A visit stores the fee in force on its date, so changing fees never alters past bills.

## Testing

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | Unit tests (fees, schedules, days off, Overview figures, messages, input parsing) and database tests (all migrations, balances, the billing upgrade, row-level security between clinics) on an in-memory Postgres | Nothing — runs offline in ~15 s |
| `npm run test:e2e` | Browser tests (Playwright) of the real app: sign-in and passwords, attendance and receipts, the add-patient wizard, payments and fees, past sessions and editing visits, days off | A Supabase project (see below); builds the app first |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript | — |

**Browser tests setup (once):**
1. `npx playwright install chromium`
2. Use a **separate Supabase project for testing** so test accounts never mix with real data. Run all migrations in it and turn **off** *Confirm email*.
3. Put its keys in `.env.test.local` (falls back to `.env.local` if missing):
   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…   # optional: lets the tests delete their test logins afterwards
   ```
   Each test file signs up its own `uitest.…@example.com` account with demo patients and removes its data afterwards.
4. To test a server that's already running, set `E2E_BASE_URL=http://localhost:3000`.

**CI:** GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, type-check, unit + database tests and a production build on every push to `main` and every pull request. Browser tests run on demand (*Actions → CI → Run workflow → e2e*) using the `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` and `E2E_SUPABASE_SERVICE_ROLE_KEY` repository secrets.

## Code map

| Path | What |
|---|---|
| `src/app/(app)/page.tsx` | Home: today at a glance, needs attention, next 7 days, this month |
| `src/app/(app)/today/` | Today: one-tap Present / Absent, receipts, pain score, off today |
| `src/app/(app)/patients/` | Patient list, add-patient wizard, patient page (Overview, Visits, Account, Schedule) and its task screens |
| `src/app/(app)/profile/` | Profile, language, team, fees & visit types, days off + notify patients, help & feedback |
| `src/app/(app)/actions.ts` | All server actions (writes) |
| `src/app/team-actions.ts`, `src/app/join/`, `src/app/welcome/` | Clinic teams: invites, roles, joining, leaving |
| `src/i18n/` | Translations: `t("English text")`, the Hindi dictionary, server (`getT`) and client (`useT`) helpers |
| `src/lib/fees.ts` | Dated fee lookup and how each visit is priced (package or fee) |
| `src/lib/schedule.ts` | Plan maths: who's expected on a day, next visit, projected package end |
| `src/lib/overview.ts` | Overview figures: attendance, adherence, dues since, recent activity |
| `src/lib/days-off.ts` | Clinic closures and patients' days off |
| `src/lib/board.ts` | Who's expected / marked / off on a day (Today and Home) |
| `src/lib/messages.ts` | WhatsApp receipts, summaries and cancellation notices |
| `src/proxy.ts` | Session refresh + redirect to `/login` |
| `tests/`, `e2e/` | Unit + database tests (Vitest), browser tests (Playwright) |

## Roadmap

- **Later**: session times, home exercise programme on WhatsApp, standard outcome questionnaires, patient "passbook" link + UPI pay button, reports, more languages (Marathi, Tamil, Telugu…), marking attendance fully offline
- **v2**: patient login, one login in several clinics, automatic WhatsApp (Business API)
