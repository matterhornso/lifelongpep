# lifelongpep — landing page

Doctor-gated longevity marketplace for India. Currently pre-launch and in waitlist mode.

## What's here

- `index.html` — the main landing page.
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

## Waitlist form

The waitlist form posts to [formsubmit.co](https://formsubmit.co/) which forwards
submissions to `hello@lifelongpep.fit`. The first submission triggers an
activation email — confirm it once and all subsequent submissions are forwarded
as plain emails.

## Custom domain

Add a `CNAME` file with the apex domain (currently `lifelongpep.fit`) and configure
the DNS A records to point to GitHub Pages.

## Stack

- Plain HTML + CSS + ES modules. No framework, no build step.
- Instrument Serif (display) + Source Serif 4 (body) + Instrument Sans (UI), all
  from Google Fonts.
- `@chenglou/pretext` for text reflow on long-form headings/ledes.
