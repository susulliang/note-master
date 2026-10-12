# Ecovacs Ticket Notes

A support workspace for Ecovacs North America agents. It guides call information
collection, creates consistent ticket notes, and brings product-support tools,
team metrics, and agent self-tests into one app.

## Features

- Guided call workflow with autosaved fields, quick replies, and copy-ready notes
- Product, FAQ, manual, and SKU lookup tools
- Optional call transcription and AI-assisted parsing
- DASH performance views, opened with `Shift+D`
- TEST quizzes with scores stored through a Cloudflare Worker and D1

## Development

Requirements: Node.js 20.19+ (or 22.12+).

```sh
npm install
npm run dev
```

Useful commands:

```sh
npm run build
npm run lint
npm run sync:reports
npm run publish:dashboard-data
npm run deploy:workers
```

## Dashboard Reports

Raw Salesforce and Connect exports belong in the local `sf_reports/` folder.
They are ignored by Git and are not deployed. Keep timestamped report names so
the parser can select the newest files. `npm run sync:reports` creates a local
snapshot under `dashboard_publish/`; `npm run publish:dashboard-data` validates
it and publishes it to the public R2 bucket. These commands need current report
exports and local Cloudflare credentials.

See [REPORT_REFRESH_RUNBOOK.md](REPORT_REFRESH_RUNBOOK.md) for download,
validation, and publishing steps. FAQ source workbooks under `FAQ/` are
versioned application inputs and should remain in Git.

## Deployment And Secrets

The frontend is deployed to Vercel. Cloudflare Workers serves the API and
connects to the `eco-data` D1 database; dashboard metrics are loaded from R2.
Set `VITE_DASHBOARD_DATA_URL` to the published dashboard JSON URL when building
the frontend.

Keyword-alert administration uses a PBKDF2 hash stored as the Worker secret
`ALERT_ADMIN_PASSWORD_HASH`, never as plaintext in the repository or D1. Use
`node scripts/hash-keyword-alert-password.mjs` to generate a verifier, then
set it with `npx wrangler secret put ALERT_ADMIN_PASSWORD_HASH`.

During local development, Vite proxies `/api/*` to the Cloudflare Worker by
default, so test scores and keyword alerts use the shared `eco-data` D1 database.
Local quiz submissions and alert edits therefore affect live data. To target a
different Worker, set `LOCAL_WORKER_API_ORIGIN` in `.env.local`.
