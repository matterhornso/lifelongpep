# lifelongpep backend API

Cloudflare Worker + D1 backend for lifelongpep pre-launch lead capture and early operations.

## What it does

- Stores leads in Cloudflare D1.
- Accepts waitlist, GLP-1 consult request, agent intake, doctor, partner, and issues leads.
- Returns a stable `request_id` for future status checks.
- De-duplicates repeated submissions with an idempotency key.
- Records audit events and internal notes.
- Supports protected admin list/detail/update/metrics/CSV endpoints.
- Supports optional Resend email notifications.
- Uses hashed IPs for basic rate limiting without storing raw IP addresses.
- Supports CORS for `lifelongpep.fit` and local development.
- Keeps the static site working by allowing the frontend to fall back to FormSubmit while this API is not deployed.

## Endpoints

Public:

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/leads`
- `GET /v1/leads/:id/status`

Admin, protected by `Authorization: Bearer <ADMIN_TOKEN>`:

- `GET /v1/admin/leads?status=&intent=&q=&limit=&offset=`
- `GET /v1/admin/leads/:id`
- `PATCH /v1/admin/leads/:id`
- `POST /v1/admin/leads/:id/notes`
- `GET /v1/admin/leads.csv`
- `GET /v1/admin/metrics`

## Deploy

Install Wrangler if needed:

```bash
npm install -g wrangler
```

Create the D1 database:

```bash
wrangler d1 create lifelongpep_leads
```

Copy the returned `database_id` into `wrangler.toml`.

Set required secrets:

```bash
wrangler secret put ADMIN_TOKEN
wrangler secret put IP_HASH_SALT
```

Optional email notification secrets:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put NOTIFY_TO_EMAIL
wrangler secret put NOTIFY_FROM_EMAIL
```

Apply the schema:

```bash
wrangler d1 migrations apply lifelongpep_leads --remote
```

Deploy the worker:

```bash
wrangler deploy
```

Then add DNS/routing so `api.lifelongpep.fit` points to this Worker.

## Local development

```bash
wrangler dev
```

Run the local smoke test without Cloudflare:

```bash
npm test
```

To test against `wrangler dev`:

```bash
curl -X POST http://127.0.0.1:8787/v1/leads \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","intent":"glp1-readiness","source":"manual-test"}'
```

Admin example:

```bash
curl http://127.0.0.1:8787/v1/admin/leads \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Notes

The API stores pre-launch interest only. It does not provide medical advice, diagnosis, booking, prescription, payment, or fulfillment.
