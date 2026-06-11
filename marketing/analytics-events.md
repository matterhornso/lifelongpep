# Analytics Event Plan

## Current setup

Plausible Analytics is installed on public pages with:

```html
<script defer data-domain="lifelongpep.fit" src="https://plausible.io/js/script.js"></script>
```

This uses Plausible Cloud. The open-source `plausible/analytics` repository is the server product for self-hosting and would require separate infrastructure.

Add `lifelongpep.fit` in Plausible, then create custom event goals matching the names below.

## Core events

- `Waitlist Signup`: successful waitlist form submission
- `Issues Subscribe`: successful issues form submission
- `Waitlist CTA Click`: user clicks a waitlist CTA from any tracked page
- `Doctor Partner Click`: user clicks doctor partner interest
- `Partner Click`: user clicks recovery or fulfillment partner interest
- `Agent Access Click`: user clicks agent access interest
- `Contact Click`: user clicks the general contact email
- `External Openwearables Click`: user clicks openwearables.io
- `Waitlist Mailto Fallback`: waitlist form failed and opened mail client fallback
- `Issues Mailto Fallback`: issues form failed and opened mail client fallback
- `Thank You View`: user lands on the intent-specific thank-you page
- `404 View`: user lands on the GitHub Pages 404 page

## Conversion pages

- `/thank-you/?intent=glp1-readiness`: point users to the GLP-1 readiness checklist, muscle-loss prevention, and stopping/maintenance pages.
- `/thank-you/?intent=doctor`: point doctors to doctor network standards and onboarding.
- `/thank-you/?intent=agent`: point agent builders to the dedicated agent access page.

## Useful properties

- `page`
- `cta_text`
- `source_url`
- `intent`: waitlist, issues, doctor, partner, agent, press
- `intent`: early-consult, glp1-readiness, researching-peptides, doctor, partner, agent, issues
- `utm_source`
- `utm_medium`
- `utm_campaign`

## Weekly dashboard

- Visitors by page
- Waitlist conversion rate
- Issues subscription conversion rate
- Top acquisition source
- Top SEO landing page
- Contact clicks by intent
- Search Console queries and average position
- FormSubmit activation state

## Implemented form routing

The homepage waitlist form now captures optional intent:

- early consult access
- GLP-1 readiness
- researching peptides
- doctor
- recovery, diagnostics, or fulfillment partner
- agent access
- educational issues

Successful submissions redirect to `/thank-you/?intent=...` for cleaner conversion tracking.
