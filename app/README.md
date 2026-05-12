# lifelongpep booking app

Doctor-consult + recovery-session booking surface for lifelongpep. Deploys to `book.lifelongpep.fit` on Vercel. The deployed landing page at `lifelongpep.fit` (one directory up) is untouched except for a single "Book now" link in the topbar.

## What's in this directory

```
app/
  src/
    pages/
      index.astro              — two-door landing (Consult / Recovery)
      doctors/
        index.astro            — anonymized doctor cards
        [id]/book.astro        — slot picker + payment
      recovery/
        index.astro            — recovery sessions catalog
        [session_id]/book.astro
      confirm/[booking_id].astro
      api/payments/
        consult-order.ts       — creates Razorpay order for ₹2,500 consult
        recovery-order.ts      — creates Razorpay order for a recovery session
        razorpay-webhook.ts    — confirms booking, fires email + .ics
    components/
      Topbar.astro
      Footer.astro
      DoctorCard.astro
      RecoveryCard.astro
      SlotPicker.tsx           — the only React island
    layouts/Base.astro
    lib/
      supabase.ts              — anon + service-role clients
      razorpay.ts              — order create + signature verify
      email.ts                 — Resend transactional
      ics.ts                   — .ics generation for consult invites
      types.ts                 — shared types + CONSULT_FEE_INR constant
      fallback-data.ts         — dev fallback when Supabase isn't configured
    styles/global.css          — design tokens (mirrors DESIGN.md exactly)
  supabase/
    migrations/0001_init.sql   — schema + enums + RLS scaffolding
    seed/0001_seed.sql         — 5 placeholder doctors + 3 recovery providers
  DECISIONS.md                 — stack rationale, schema, route map, risks
  .env.example
```

## Run locally

```bash
cd app
cp .env.example .env
# fill in Supabase + Razorpay (test mode) + Resend keys

bun install
bun run dev
# → http://localhost:4321
```

If you don't fill in env vars, pages still render — they fall back to placeholder data and placeholder slots. The Razorpay flow will throw a 503 until keys are set.

## Apply the database migration

Two options.

**A. Supabase Studio (recommended for first apply):**
1. Create a project at https://supabase.com/dashboard.
2. Paste `app/supabase/migrations/0001_init.sql` into the SQL editor → Run.
3. Paste `app/supabase/seed/0001_seed.sql` → Run.
4. Copy `Project URL`, `anon public` key, `service_role` key into `.env`.

**B. Supabase CLI (preferred once you've linked the project locally):**
```bash
supabase link --project-ref <ref>
supabase db push
psql "$(supabase db url)" -f supabase/seed/0001_seed.sql
```

## Razorpay setup (test mode)

1. https://dashboard.razorpay.com/app/keys → Generate Test Key. Copy `key_id` and `key_secret` into `.env` as `PUBLIC_RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. https://dashboard.razorpay.com/app/webhooks → New webhook:
   - URL: `https://book.lifelongpep.fit/api/payments/razorpay-webhook`
   - Secret: copy into `.env` as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.authorized`, `payment.captured`, `payment.failed`
3. Test cards: https://razorpay.com/docs/payments/payments/test-card-details/

Live mode requires KYC — see [Razorpay KYC docs](https://razorpay.com/docs/payments/payments/test-mode/#switching-from-test-to-live-mode). Don't flip to live until: legal entity, GST, settlement bank account, and refund policy page are in place.

## Resend setup

1. https://resend.com/api-keys → create. Copy into `.env` as `RESEND_API_KEY`.
2. Verify `lifelongpep.fit` as a sender domain (DNS records).
3. `RESEND_FROM_EMAIL` is already set to `hello@lifelongpep.fit` — change in `.env` if you want a different from-address.

## Deploy to Vercel

1. `vercel link` from `app/` (one-time).
2. Set env vars: `vercel env add` for each name in `.env.example`.
3. `vercel --prod` for production deploy.
4. DNS: add a `CNAME` record `book.lifelongpep.fit → cname.vercel-dns.com` at your DNS provider. Vercel auto-provisions the cert.

## Design system

All UI tokens are in `src/styles/global.css` and mirror `~/lifelongpep/DESIGN.md` exactly:

- **Type:** Instrument Serif (display) / Source Serif 4 (body) / Instrument Sans (UI)
- **Color:** cream `#F4F0E8` bg, oxblood `#5C2E2E` accent, no purple/teal/navy
- **Radius:** 2px inputs, 4px cards. No pills, no `9999px`.
- **No shadows. No gradients. No skeleton-shimmer.**
- **Tone:** product-clear, no bro-science, no niche-editorial polemic, no "Indian-context" framing.

Anti-patterns the design system forbids — review `DESIGN.md` before adding new surfaces.

## Open items for the founder (before going live)

- Fix the cut percentage (currently `CUT_PERCENT=15` in `.env.example` — change to whatever you've decided).
- Replace seed doctors with real onboarded doctors (`display_name` is internal-only, never rendered).
- Replace seed recovery providers with real Bangalore partnerships (Indiranagar Recovery Studio, Koramangala Cryo Lab, HSR Heat & Light are placeholders).
- Razorpay live-mode KYC.
- Resend domain verification.
- A separate flow for issuing the video call link (Zoom/Meet/Whereby) per consult — currently the confirmation email says "join link will be emailed 1 hour before"; the cron that does that send is not yet built.
- Round-robin doctor matching with editor override (the catalog page hands off to a doctor-specific booking page; the matching engine that picks the doctor for a customer with no preference is not yet built).
- Magic-link auth + "My consults" page.
