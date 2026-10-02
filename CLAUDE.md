@AGENTS.md

# Project notes
- Physio session tracker for India first (INR, Asia/Kolkata defaults live on `clinics` so other regions can be added).
- Every table carries `clinic_id`; a solo physio is a clinic of one. Keep it that way so multi-physio clinics need no migration.
- Schema changes go in a new file under `supabase/migrations/`; RLS must cover every new table.
- WhatsApp is click-to-chat (`wa.me`) only — no Business API yet.
