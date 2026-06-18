# lifelongpep — landing page

Doctor-gated metabolic longevity and GLP-1 readiness platform for India. Currently pre-launch and in waitlist mode.

## What's here

- `index.html` — the main landing page.
- `glp-1-readiness-consult/`, `metabolic-longevity-india/`,
  `glp-1-muscle-loss-prevention/`, `glp-1-vs-peptides/` — first-lane
  GLP-1 readiness and metabolic longevity SEO/AEO pages.
- `glp-1-readiness-checklist/`, `questions-to-ask-before-glp-1/`,
  `what-happens-after-stopping-glp-1/`,
  `mounjaro-vs-wegovy-generic-semaglutide-india/` — GLP-1 readiness
  question-capture pages.
- `peptide-consult-india/` — SEO landing page for supervised peptide consult demand.
- `longevity-doctor-india/` — SEO landing page for longevity doctor consult demand.
- `issues/` — educational content index and issue pages.
- `faq/`, `about/`, `medical-disclaimer/`, `editorial-policy/` — trust and AEO pages.
- `what-is-a-peptide-consult/`, `doctor-supervised-peptides-india/`,
  `what-to-bring-to-a-longevity-consult/`, `wearable-protocol-tracking/` —
  SEO/AEO educational pages.
- `peptides-vs-supplements/`, `longevity-doctor-vs-general-physician/`,
  `bloodwork-for-longevity-consult/`, `recovery-tracking-sauna-cold-plunge-red-light/` —
  additional SEO/AEO educational pages.
- `doctor-onboarding/`, `partner-interest/`, `thank-you/` — conversion and partner-routing pages.
- `doctor-network/` and `agent-access/` — trust and agent workflow pages.
- `agent-intake/` and `glp-1-consult-request/` — structured API-first
  pre-launch intake pages for agents and high-intent GLP-1 consult requests.
- `backend/lead-api/` — deployable Cloudflare Worker + D1 backend with lead
  capture, admin triage, notes, metrics, CSV export, idempotency, rate-limit
  hooks, and optional email notifications.
- `lead-client.js` — API-first lead submission helper with FormSubmit fallback.
- `agents.txt`, `.well-known/lifelongpep-agent.json`, `openapi.json`, and
  `mcp/manifest.json` — agent-readable discovery and draft integration contracts.
- The homepage includes a Human/Agent access section. Agent access is positioned as planned MCP, CLI, and API workflows for consult preparation, AI education, and doctor booking, using static command-card patterns inspired by `nolly-studio/cult-ui` without adding a React/Tailwind dependency.
- `404.html` — GitHub Pages fallback page.
- `distribution/` — founder LinkedIn drafts, outreach emails, and prospect-list template.
- `marketing/` — marketing plan, keyword map, content calendar, messaging, and analytics plan.
- `pretext.js` — `@chenglou/pretext` vendored for client-side text reflow.

## Running locally

The page is a single static HTML file. Serve it from any static server:

```bash
bun --bun -e "Bun.serve({ port: 8765, fetch: (req) => new Response(Bun.file('./index.html')) })"
```

Or:

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Lead capture

The public forms use `lead-client.js` to try the lead API first:

```text
https://api.lifelongpep.fit/v1/leads
```

If the API is not deployed or unavailable, forms fall back to
[formsubmit.co](https://formsubmit.co/) and forward submissions to
`hello@lifelongpep.fit`. The first FormSubmit submission triggers an activation
email — confirm it once and all subsequent submissions are forwarded as plain
emails.

The backend lives in `backend/lead-api/` and is designed for Cloudflare Workers
with D1. See `backend/lead-api/README.md` for deployment steps, required
secrets, admin endpoints, and local smoke tests.

## Custom domain

Add a `CNAME` file with the apex domain (currently `lifelongpep.fit`) and configure
the DNS A records to point to GitHub Pages.

## Stack

- Plain HTML + CSS + ES modules. No framework, no build step.
- Instrument Serif (display) + Source Serif 4 (body) + Instrument Sans (UI), all
  from Google Fonts.
- `@chenglou/pretext` for text reflow on long-form headings/ledes.
