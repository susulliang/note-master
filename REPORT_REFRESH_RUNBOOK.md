# DASH Report Refresh Runbook

This runbook covers the current human-in-the-loop routine for downloading
authenticated reports, building the dashboard snapshot, and publishing it to
Cloudflare R2. It is intended for a local agent operating with the user's
authenticated browser and Wrangler session.

## Important Boundaries

- The URLs in [`scripts/report-download-sources.json`](scripts/report-download-sources.json)
  are entry points, not credentials. Sign in through the normal browser SSO
  flow first and complete any MFA prompts with the user. Never store passwords,
  cookies, tokens, or browser profile data in the repository.
- The existing scripts parse files already in `sf_reports/`; they do not log in
  to Salesforce or Connect and do not download reports.
- The GitHub Action only parses the files in its checkout. It does not use a
  user's browser session. Unattended downloads require an approved authentication
  method and are not implemented yet.
- The R2 JSON is publicly readable. It contains agent display names and metrics.
  Never upload raw report files or publish if the generated snapshot contains
  unexpected personal or confidential data.

## Download Sources

Open the registry URLs in an authenticated browser. If a link redirects to a
login page, finish the normal SSO flow, then revisit the source. For the Connect
source, use the authenticated app's export controls if the page does not start
the CSV download directly. Verify each download is a report file, not an HTML
login page.

Save reports directly into `sf_reports/`. Use the following names, with the
download timestamp appended before the extension:

| Registry key | Suggested filename pattern |
| --- | --- |
| `call_historical_metrics` | `Historical Metrics Report-YYYY-MM-DD-HH-MM-SS.csv` |
| `csat` | `CSAT-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `amr_email` | `AMR Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `onetouch_mtd` | `One touch rate-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `average_response_chat` | `Average response time Chat-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `average_response_email` | `Avg Response Time Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `first_response_email` | `First Response Time Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `mtd_chat` | `MTD Chat Messaging-YYYY-MM-DD-HH-MM-SS.xlsx` |

The parser selects the newest matching filename by its embedded timestamp.
Avoid browser-generated names such as `report (1).xlsx` and avoid undated names:
an undated file can lose to an older timestamped file. Do not change a file's
extension unless it was actually converted to that format.

### Missing Call Volume Source

The current report registry has a link for Call Historical Metrics, which feeds
the per-agent history, but it does not have a link for the separate
`MTD Call Data.csv` aggregate. The parser requires both files. Keep
`MTD Call Data-YYYY-MM-DD-HH-MM-SS.csv` current using its approved source; do
not assume the historical report replaces it. Add its authenticated source to
the registry once the report owner provides the correct URL.

## Parse And Review

From the repository root, generate a complete local snapshot:

```sh
REQUIRE_COMPLETE_DASHBOARD_DATA=1 npm run sync:reports
```

The command writes the ignored file
`dashboard_publish/dashboard-data.json` and prints the selected source filename
and parsed counts for each report. Confirm every section is present and each
selected filename has the timestamp from this refresh. In particular, confirm
that both `call` and `historical` came from current files.

Optionally inspect the generated source map:

```sh
node --input-type=module -e 'import fs from "node:fs"; const d=JSON.parse(fs.readFileSync("dashboard_publish/dashboard-data.json","utf8")); console.log(d.generatedAt); console.table(d.sources); console.log({historicalAgents:d.historical?.agents?.length, historicalQueues:d.historical?.queues?.length});'
```

Because the R2 object is public, also stop if the generated JSON contains an
email address:

```sh
node --input-type=module -e 'import fs from "node:fs"; const text=fs.readFileSync("dashboard_publish/dashboard-data.json","utf8"); if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) throw new Error("Email address found in public snapshot"); console.log("No email addresses found in snapshot");'
```

Do not publish if a section is missing, a source filename is stale, parsed
counts are unexpectedly low, or the downloaded file was actually a login page.
The publish script also runs the complete-data check before upload.

## Publish To R2

R2 authentication is separate from the Salesforce/Connect browser session.
Confirm Wrangler is authenticated:

```sh
wrangler whoami
```

If needed, use the approved Wrangler login flow and complete Cloudflare
authentication in the browser. The local publish command requires the Cloudflare
account ID and bucket name; it does not require putting a token in source code:

```sh
export CLOUDFLARE_ACCOUNT_ID="<account-id>"
export R2_BUCKET="eco-dash"
npm run publish:dashboard-data
```

This command regenerates the complete snapshot and overwrites
`eco-dash/dashboard-data.json`. For GitHub Actions, the corresponding secrets
are `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, and `CLOUDFLARE_API_TOKEN`; never put
the token in a `VITE_` variable, the report registry, or a committed file.

## Verify The Published Snapshot

Check that the public object is current and references this refresh's files:

```sh
node --input-type=module -e 'const url="https://pub-4f2a0555b3314f2b83bb90e44ea586f3.r2.dev/dashboard-data.json?verify="+Date.now(); const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`R2 returned HTTP ${r.status}`); const d=await r.json(); console.log(JSON.stringify({generatedAt:d.generatedAt,sources:d.sources,historicalAgents:d.historical?.agents?.length},null,2));'
```

Confirm HTTP 200, the new `generatedAt`, the expected source filenames, and
nonzero historical agent counts. The query string avoids reading a cached
response. Report the result and any parser warnings to the user.

## Repeated Runs

Repeat the browser download, local parse/review, publish, and live verification
steps for each refresh. Old files are not deleted automatically; keep timestamped
filenames so source selection stays deterministic. The source downloader and
scheduled authentication flow remain future work.
