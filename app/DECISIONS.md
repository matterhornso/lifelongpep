# Booking app — decisions

Built on `feat/booking-app` after the scheduled remote agent failed to produce visible work in the repo. This file replaces the 8-dossier research output in the original plan with a tight one-pager so we could start shipping in-session.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Astro 5 (SSR) + a single React island for the slot picker | Static-feel pages match the editorial-minimal aesthetic; only the slot grid needs reactivity |
| Hosting | Vercel on `book.lifelongpep.fit` (subdomain) | Founder pick. Landing stays on GitHub Pages, untouched except for a single Book-now link |
| Database + auth | Supabase | Postgres + RLS + magic-link auth + Resend SMTP. Free tier comfortably covers MVP |
| Payments | Razorpay (test mode now, live after KYC) | India default, UPI-native, line-item disclosure of our cut |
| Email | Resend | Modern API, plays nicely with Supabase auth and transactional templates |
| Calendar | `ical-generator` for `.ics` attachments | Zero hosted infrastructure; works in Gmail / Apple Calendar / Outlook |

## What's deferred (intentionally, out of scope for this PR)

- Doctor admin dashboard (Phase 1.5)
- Doctor onboarding / KYC flow
- Pharmacy fulfillment surface
- openwearables.io integration (Phase 3)
- Real Bangalore recovery-provider partnerships — using seed data for now
- Magic-link auth on the customer side (current flow is guest-checkout via email; magic-link is for the "My consults" page in a follow-up phase)
- Refund flow (cancellation marks the booking `cancelled` and reverses the Razorpay payment via webhook; full reconciliation UI is out of scope here)
- Round-robin doctor matching with editor override (anonymized cards show specialty + neighborhood; the next phase wires the matching engine)

## Architecture

```
                  ┌────────────────────────────────┐
                  │  lifelongpep.fit (landing)     │
                  │  GitHub Pages, static HTML     │
                  │  + 1 new "Book now" link       │
                  └───────────────┬────────────────┘
                                  │
                                  ▼
                  ┌────────────────────────────────┐
                  │  book.lifelongpep.fit          │
                  │  Astro 5 SSR on Vercel         │
                  │  React island for slot picker  │
                  └───────┬──────────────┬─────────┘
                          │              │
                  ┌───────▼──────┐   ┌───▼─────────┐
                  │   Supabase   │   │  Razorpay   │
                  │  Postgres +  │   │  test mode  │
                  │  RLS + auth  │   │  → live KYC │
                  └──────────────┘   └─────────────┘
                          │
                  ┌───────▼──────┐
                  │   Resend     │
                  │  transactional│
                  │  email + ics │
                  └──────────────┘
```

## Database schema (Supabase / Postgres)

```sql
-- doctors are anonymized on the public surface (cards show specialty + neighborhood + years post-MD only)
-- the display_name column exists for internal admin / matchmaking but is NEVER rendered on customer-facing pages
create type neighborhood as enum ('Indiranagar','Koramangala','HSR','Whitefield','Jayanagar');
create type consult_mode as enum ('video','in_person');
create type availability_status as enum ('live','soon','off');
create type booking_kind as enum ('consult','recovery');
create type booking_status as enum ('pending_payment','confirmed','cancelled');
create type recovery_type as enum ('sauna','steam','cryotherapy','red_light','salt_bath');

create table doctors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,           -- internal only
  specialty text not null,
  neighborhood neighborhood not null,
  years_post_md int not null,
  modes consult_mode[] not null,
  availability availability_status not null default 'soon',
  bio_short text,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  phone text,
  created_at timestamptz default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade,
  recovery_session_id uuid,              -- set if this slot is on a recovery provider
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked boolean default false,
  created_at timestamptz default now(),
  check (
    (doctor_id is not null and recovery_session_id is null) or
    (doctor_id is null and recovery_session_id is not null)
  )
);

create index on slots (doctor_id, starts_at);
create index on slots (recovery_session_id, starts_at);

create table recovery_providers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  neighborhood neighborhood not null,
  created_at timestamptz default now()
);

create table recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references recovery_providers(id) on delete cascade,
  type recovery_type not null,
  duration_min int not null,
  price_inr int not null,
  doctor_recommended boolean default false,
  created_at timestamptz default now()
);

alter table slots add constraint slots_recovery_fk
  foreign key (recovery_session_id) references recovery_sessions(id) on delete cascade;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  kind booking_kind not null,
  doctor_id uuid references doctors(id),
  recovery_session_id uuid references recovery_sessions(id),
  slot_id uuid references slots(id),
  customer_id uuid references customers(id) not null,
  consult_mode consult_mode,
  status booking_status not null default 'pending_payment',
  total_inr int not null,
  cut_inr int not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz default now(),
  cancelled_at timestamptz
);

create index on bookings (customer_id);
create index on bookings (status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  razorpay_order_id text not null,
  razorpay_payment_id text,
  amount_inr int not null,
  status text not null,                  -- 'created','authorized','captured','failed','refunded'
  raw_payload jsonb,
  created_at timestamptz default now()
);
```

RLS sketch:
- `doctors`, `recovery_providers`, `recovery_sessions`: `select` open (public), all other ops blocked.
- `slots`: `select` open. Writes only via service role.
- `customers`, `bookings`, `payments`: all ops blocked on anon; writes only via service role from the server endpoints. (Magic-link auth → policy lets a logged-in customer read their own rows — added in a follow-up phase.)

## Route map

| Route | What | Auth |
|---|---|---|
| `/` | Booking-app landing — two doors (consult / recovery) | none |
| `/doctors` | Anonymized doctor cards (specialty + neighborhood + years post-MD) | none |
| `/doctors/[id]/book` | Slot picker (React island), video/in-person toggle | none |
| `/recovery` | Recovery providers + session types, doctor-recommended flag, line-itemized cut | none |
| `/recovery/[session_id]/book` | Slot picker for a session at a provider | none |
| `/confirm/[booking_id]` | Confirmation page (post-payment) | session-scoped via booking_id |
| `/api/payments/consult-order` | POST → creates Razorpay order, returns key_id + order_id | none (rate limit later) |
| `/api/payments/recovery-order` | POST → same for recovery booking | none |
| `/api/payments/razorpay-webhook` | POST from Razorpay → confirms booking, fires email + .ics | signed |

## Build effort estimate (in-session)

| Surface | Hours |
|---|---|
| Scaffold + design tokens + layout | 0.5 |
| DECISIONS.md + schema migrations + seed | 1.0 |
| Doctor list page | 0.5 |
| Doctor slot picker (React island) | 1.5 |
| Razorpay order endpoint + webhook | 1.0 |
| Confirmation page + email + .ics | 1.0 |
| Recovery list + slot picker | 1.5 |
| Razorpay for recovery + line-item rendering | 0.5 |
| "Book now" CTA on landing + draft PR | 0.5 |
| **Total** | **~8 hours** |

In-session reality: scaffold + schema + doctor flow + recovery list are achievable in one context window. Polish, email-send wiring against a real Resend key, and live integration testing carry over.

## Three risk callouts

1. **No real Razorpay test keys yet.** The integration is scaffolded and will compile, but until the founder provisions test-mode keys and sets `PUBLIC_RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`, the order endpoint will throw at runtime. Same for Supabase URL/keys.
2. **Cut percentage is unset.** The founder hasn't fixed the number. Recovery booking line items render `{CUT_PERCENT}%` from env (default 15 in `.env.example`) — change it before live.
3. **Seed data is fake.** The five doctors and three recovery providers in `app/supabase/seed/0001_seed.sql` are placeholders. Real doctor onboarding + real Bangalore provider partnerships are out of scope here; replace seed before live launch.

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-05-12 | Astro + Vercel + Supabase + Razorpay test | Founder picked Supabase and Vercel; Astro fits the editorial-minimal aesthetic; minimal React surface |
| 2026-05-12 | Subdomain `book.lifelongpep.fit`, landing untouched | Constraint from founder: do not touch index.html except for one Book-now link |
| 2026-05-12 | Skip 8-dossier research; one DECISIONS.md instead | Optimizes for shipping in this session over re-deriving justifications |
| 2026-05-12 | Guest checkout (email only), no magic-link auth in v1 | Lowest friction. Magic-link added when "My consults" page is built |
