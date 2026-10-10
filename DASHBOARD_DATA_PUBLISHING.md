# DASH Data Publishing

DASH production builds load a separately published `dashboard-data.json`; the
Salesforce report folder and its generated snapshot are not copied into the app
bundle. Local development can still parse reports from `sf_reports/`.

## Cloudflare R2 setup

The `eco-dash` bucket is configured with public `r2.dev` reads and browser
`GET` CORS. Its dashboard snapshot URL is:
`https://pub-4f2a0555b3314f2b83bb90e44ea586f3.r2.dev/dashboard-data.json`.

1. For future GitHub Actions publishes, create an API token with R2 Object
   Read & Write access scoped to `eco-dash`. The public URL and CORS policy
   were enabled with Wrangler:

   ```sh
   wrangler r2 bucket dev-url enable eco-dash
   wrangler r2 bucket cors set eco-dash --file r2-cors.json
   ```

   The included CORS policy permits browser `GET` requests from any origin;
   public R2 objects are readable outside browsers regardless of CORS.
2. Add these GitHub repository secrets for **Actions → Publish DASH data**:
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `R2_BUCKET`.
3. Production DASH defaults to the URL above. To use a different bucket or a
   staging snapshot, override `VITE_DASHBOARD_DATA_URL` in the app's build
   environment and rebuild/deploy. Never put R2 write credentials in a
   `VITE_` variable.
4. In GitHub Actions, run **Publish DASH data** and confirm the publish input.
   The workflow parses the latest matching files in `sf_reports/` and uploads
   only the generated JSON object using Wrangler. Locally, install Wrangler
   with `npm install --global wrangler@4`, authenticate with `wrangler login`
   (or set `CLOUDFLARE_API_TOKEN`), then run
   `CLOUDFLARE_ACCOUNT_ID=<account-id> R2_BUCKET=eco-dash npm run publish:dashboard-data`.

The publisher writes its intermediate file to the Git-ignored
`dashboard_publish/dashboard-data.json`. `npm run sync:reports` only generates
that file; it does not upload it. The publish workflow is manual and is
independent from app deployment.

The Vercel Content Security Policy permits `*.r2.dev` and
`*.r2.cloudflarestorage.com`. If using a custom R2 domain, add that exact
origin to the `connect-src` policy in `vercel.json`.

## Data visibility

The browser fetches this JSON directly, so its read URL is public. The snapshot
contains agent names and performance metrics; anyone with the URL can read it.
For restricted data, use an authenticated backend/proxy rather than a public
R2 URL.
