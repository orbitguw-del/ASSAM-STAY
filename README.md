# Homestay Desk

MVP of the Assam Homestay Platform: one app where a homestay owner takes bookings, keeps the
official tourist register with guest signatures, sends the daily police report, files the monthly
return and issues GST-correct bills.

Built to the Assam Tourism (Development & Registration) Act 2024 (amended by Assam Act XXI of 2026)
and the Assam Tourism Accommodation (Development and Registration) Rules 2026.

## What it does

| Area | What the app does | Legal source |
| --- | --- | --- |
| Bookings | Calendar, walk-ins, advances with receipts. The database refuses overlapping stays in a room. | |
| Check-in | Guest details, masked Aadhaar, passport and visa for foreigners, guest signature (col 9), staff signature (col 12) | Rule 12(ix), Annexure 10 |
| Form C | 24-hour task for every foreign guest, FRRO acknowledgement recorded | FRRO |
| Check-out | GST tax invoice or bill of supply, price guard above tariff, guest signature at departure (col 14) | Act s.2(u), Annexure 10 |
| Register | All 15 Annexure 10 columns, print, CSV export, "changed after signing" check | Annexure 10 |
| Police report | Everyone who stayed the previous night, share, print, mark sent | Act s.18A |
| Monthly return | Annexure 11 built from the register, owner signs, mark submitted | Rule 11 |
| Compliance | Registration renewal, licence expiry reminders, the rules table with sources | Act s.5, s.9, s.10 |

Legal values (room limits, GST slabs, deadlines) are data in `public.rules` and `src/lib/rules.js`,
so a new notification changes a row, not the code.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5180. With no Supabase keys it runs in **demo mode**: sample data for a
fictional homestay, stored only in that browser. Settings > Reset demo data starts over.

## Tests

```
npm test
```

- `supabase/tests/db.test.js` runs the real migration in an in-memory Postgres (PGlite) and checks
  double booking, tenant isolation, the 8-room limit, masked Aadhaar, signed departures, immutable
  invoices and signatures, invoice numbering and the audit log.
- `src/lib/logic.test.js` checks GST, the police list, the monthly return and the alerts.

## Connect Supabase (use it for real)

1. Go to https://supabase.com/dashboard and click **New project**. Name it `homestay-app`, region
   **Mumbai (ap-south-1)**, set a strong database password and save it somewhere safe.
2. When it is ready, open **SQL Editor** > **New query**, paste all of
   `supabase/migrations/20261003000000_init.sql`, and click **Run**.
3. Open **Authentication** > **URL Configuration**. Set **Site URL** to `http://localhost:5180` and add
   the same to **Redirect URLs**. (Add your live address here later.)
4. Open **Project Settings** > **API**. Copy **Project URL** and the **anon public** key.
5. In this folder, copy `.env.example` to `.env` and paste the two values.
6. Stop and restart `npm run dev`. The app now shows a sign-in screen: enter your email, open the link,
   then fill in **Set up your homestay**.
7. Turn on backups: **Database** > **Backups** (point-in-time recovery needs a paid plan). The register
   is a legal record, so do this before taking real guests.

## Known limits of this MVP

- Sign-in is by email link. Phone OTP needs an SMS provider (DLT registration) and comes later.
- One property per account and no staff invites yet: the owner's login is the only user.
- Check-in and check-out are several database calls; a dropped connection mid-way can leave a
  signature saved without its register line. Moving them into single database functions is next.
- Signatures are stored as images in a table protected by row-level security, not in file storage.
- The police report format under s.18A is not yet notified; the register layout is used until it is.
- GST slabs and SAC codes for food are as planned and still need a CA's confirmation.
- Not in the MVP (Phase 2+): OTA calendar sync, Razorpay payment links, the public booking page,
  offline mode, Assamese and Hindi screens.

## Layout

```
supabase/migrations/   database schema, rules, row-level security
supabase/tests/        database tests (PGlite)
src/lib/               rules, GST billing, compliance logic, data layer (demo + Supabase)
src/pages/             one file per screen
```
