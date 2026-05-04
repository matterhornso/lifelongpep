# lifelongpep — landing page

Doctor-gated longevity marketplace. Currently in waitlist mode.

## What's here

- `index.html` — the landing page.
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
submissions to `hello@lifelongpep.com`. The first submission triggers an
activation email — confirm it once and all subsequent submissions are forwarded
as plain emails.

## Custom domain

Add a `CNAME` file with the apex domain (e.g. `lifelongpep.com`) and configure
the DNS A records to point to GitHub Pages.

## Stack

- Plain HTML + CSS + ES modules. No framework, no build step.
- Instrument Serif (display) + Source Serif 4 (body) + Instrument Sans (UI), all
  from Google Fonts.
- `@chenglou/pretext` for text reflow on long-form headings/ledes.
