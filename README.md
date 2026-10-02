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
clinics ──< clinic_members >── auth.users     (a solo physio = clinic of one)
   │
   └──< patients ──< packages      (10 sessions for ₹5,000)
                 ├──< schedules     (treatment plans: valid_from → valid_until)
                 ├──< appointments  (one-off bookings: scheduled_date, booked_on)
                 ├──< sessions      (date + attended / missed / cancelled, optional booking)
                 └──< payments      (amount, method, paid_on)

patient_summary (view): sessions_bought, sessions_attended, sessions_left,
                        amount_billed, amount_paid, amount_due, last_visit
```

Every table carries `clinic_id`, and RLS restricts each user to clinics they belong to. Composite foreign keys stop a session or payment from pointing at another clinic's patient.

## Code map

| Path | What |
|---|---|
| `src/app/(app)/page.tsx` | Today screen: one-tap attendance + receipts |
| `src/app/(app)/patients/` | Patient list, add patient, patient detail |
| `src/app/(app)/settings/` | Physio name, clinic name, UPI ID |
| `src/app/(app)/actions.ts` | All server actions (writes) |
| `src/lib/messages.ts` | WhatsApp receipt / summary text |
| `src/lib/fees.ts` | Dated fee lookup and how each visit is priced (package or fee) |
| `src/lib/schedule.ts` | Plan maths: who's expected on a day, next visit, projected package end |
| `src/lib/phone.ts` | Country list, phone parsing to E.164 |
| `src/lib/format.ts` | Dates (clinic timezone), money, `wa.me` links |
| `src/components/date-field.tsx` | Type-or-pick date input |
| `src/components/multi-date-field.tsx` | Tap-to-mark calendar for many past visits |
| `src/proxy.ts` | Session refresh + redirect to `/login` |

## Roadmap

- **v1.5**: patient "passbook" link (read-only page per patient) + UPI pay button
- **Next**: session times in plans and bookings
- **v2**: patient login (Firebase phone auth / Google), clinics with multiple physios and invites, offline mode, reports
