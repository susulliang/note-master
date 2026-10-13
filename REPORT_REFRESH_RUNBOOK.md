# DASH Report Refresh Runbook

This runbook covers the human-in-the-loop routine for downloading authenticated
reports, building the dashboard snapshot, and publishing it to Cloudflare R2.
It is intended for a local agent operating with the user's authenticated
browser and Wrangler session. Last exercised end-to-end on 2026-10-11.

## Routine At A Glance

1. Browser-download the 7 Salesforce reports + 1 Connect report into `sf_reports/`
2. Refresh `scripts/money-go-high.json` from the current Lark scorecard sheet
3. Parse: `REQUIRE_COMPLETE_DASHBOARD_DATA=1 npm run sync:reports`
4. Review sources/counts + run the email privacy check
5. Publish to R2 (`wrangler r2 object put`)
6. Verify the live `r2.dev` URL

## Important Boundaries

- The URLs in [`scripts/report-download-sources.json`](scripts/report-download-sources.json)
  are entry points, not credentials. Sign in through the normal browser SSO
  flow first and complete any MFA prompts with the user. Never store passwords,
  cookies, tokens, or browser profile data in the repository.
- The existing scripts parse files already in `sf_reports/`; they do not log in
  to Salesforce or Connect and do not download reports.
- Dashboard report publishing is a local, human-in-the-loop process. Raw
  exports are intentionally excluded from Git, and unattended downloads are
  not implemented.
- The R2 JSON is publicly readable. It contains agent display names and metrics.
  Never upload raw report files or publish if the generated snapshot contains
  unexpected personal or confidential data.

## Session Authentication

Open any registry URL in the automation browser. If Salesforce redirects to a
login page, hand the browser to the user for SSO + TOTP verification (the
verification code prompt appears when the first report export is attempted).
Amazon Connect usually stays authenticated via the same user session
(`kailun.huang@vxichina.com`); re-authenticate only if redirected to SSO.

## Download Sources

Navigate to each URL and let the download happen. Navigation to the Salesforce
servlet URLs is expected to fail as a page load (`ERR_FAILED`/`ERR_ABORTED`) —
that means the download started. Files land directly in `sf_reports/` with
Salesforce-generated names (report label + download timestamp); verify each new
file appears before moving to the next report. One navigation per report —
navigating twice produces duplicate files.

| Registry key | Suggested filename pattern |
| --- | --- |
| `csat` | `CSAT-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `amr_email` | `AMR Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `onetouch_mtd` | `One touch rate-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `average_response_chat` | `Average response time Chat-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `average_response_email` | `Avg Response Time Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `first_response_email` | `First Response Time Email-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `mtd_chat` | `MTD Chat Messaging-YYYY-MM-DD-HH-MM-SS.xlsx` |
| `call_historical_metrics` | `Historical Metrics Report.csv` |

The parser selects the newest matching filename by its embedded timestamp.
Avoid browser-generated names such as `report (1).xlsx` and avoid undated names.
Do not change a file's extension unless it was actually converted to that format.

### Connect Historical Metrics (agent metric mtd)

The registry's `call_historical_metrics` URL opens the saved **agent metric
mtd** report directly:

`https://amr-callcenter-sso.my.connect.aws/historical-metrics?reportArn=arn:aws:connect:us-west-2:451979591094:instance/0331b450-81b2-4e20-ac09-8085cc4b1437/report/7123694c-88ab-4a1c-84d3-c90a3e3f0850`

If that deep link 404s, navigate manually: **Dashboards and reports →
Historical metrics tab → open the saved "agent metric mtd" report**. Then use
**Actions → Download CSV** every time. The download link is dynamic — never try
to reuse a captured export URL. The file downloads as
`Historical Metrics Report.csv` (overwrites the previous one in `sf_reports/`).

### MTD Call Data (no refresh needed)

`MTD Call Data.csv` (aggregate call totals) does **not** need a fresh download
each run — its numbers are already covered by the refreshed Historical Metrics
report. The parser still requires the file to exist; keep the most recent copy
in `sf_reports/` and expect the review output to show it as the oldest source.

## Parse And Review

From the repository root, generate a complete local snapshot:

```sh
REQUIRE_COMPLETE_DASHBOARD_DATA=1 npm run sync:reports
```

The command writes the ignored file
`dashboard_publish/dashboard-data.json` and prints the selected source filename
and parsed counts for each report. It also includes the scorecard from
[`scripts/money-go-high.json`](scripts/money-go-high.json) as `moneyGoHigh`;
keep that JSON aligned with the `Crazy New 2.0` sheet in the Lark document
[`KPI Money Go High!`](https://lmgx8md8u1.feishu.cn/wiki/I3rMwn5JJiXxByk0vQWcfGa2nSi),
including its source revision. This is data in the published snapshot, so
scorecard updates do not require a frontend rebuild.

Confirm every section is present and each selected report filename has the
timestamp from this refresh (all except `call`, see above). "Bad uncompressed
size" warnings for the xlsx files are a known zip encoding quirk of the
Salesforce exports and are non-fatal.

Inspect the generated source map:

```sh
node --input-type=module -e "import fs from 'node:fs'; const d=JSON.parse(fs.readFileSync('dashboard_publish/dashboard-data.json','utf8')); console.log(d.generatedAt); console.table(d.sources); console.log({historicalAgents:d.historical?.agents?.length, historicalQueues:d.historical?.queues?.length});"
```

Because the R2 object is public, also stop if the generated JSON contains an
email address:

```sh
node --input-type=module -e "import fs from 'node:fs'; const text=fs.readFileSync('dashboard_publish/dashboard-data.json','utf8'); if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) throw new Error('Email address found in public snapshot'); console.log('No email addresses found in snapshot');"
```

(On Windows PowerShell, keep the JS in double quotes with single-quoted strings
inside; the single-quote-outer form of these commands loses its quotes.)

Do not publish if a section is missing, a source filename is stale, parsed
counts are unexpectedly low, or the downloaded file was actually a login page.
The publish step re-runs the complete-data check.

## Publish To R2

R2 authentication is separate from the Salesforce/Connect browser session.
Confirm Wrangler is installed and authenticated:

```sh
wrangler whoami
```

If wrangler is missing, install it (`npm install --global wrangler@4`), then
`wrangler login` and complete the Cloudflare OAuth in the user's default
browser. Read the account ID from `wrangler whoami`.

`scripts/publish-dashboard-data.sh` requires bash, which is not installed on
the Windows workstation. Run its two steps directly instead (PowerShell):

```powershell
$env:REQUIRE_COMPLETE_DASHBOARD_DATA = "1"; npm run sync:reports
wrangler r2 object put "eco-dash/dashboard-data.json" `
  --file "dashboard_publish/dashboard-data.json" --remote `
  --content-type "application/json" `
  --cache-control "public, max-age=300, s-maxage=300" --force
```

The object key defaults to `dashboard-data.json` in bucket `eco-dash`
(account ID is resolved from the Wrangler login). Never put the Cloudflare
token in a `VITE_` variable, the report registry, or a committed file.

### Publish A Scorecard-Only Update

When only the Lark scorecard changes, update `scripts/money-go-high.json` with
the current sheet values, revision, and modified time, then publish just that
section while retaining the latest live Salesforce report snapshot:

```sh
R2_BUCKET=eco-dash npm run publish:money-go-high
```

The command validates KPI totals, reads the current public R2 snapshot, merges
the scorecard, checks the combined public JSON for email addresses, and uploads
the result. Set `DASHBOARD_DATA_SOURCE_URL` only when the existing snapshot is
hosted at a different public URL.

## Verify The Published Snapshot

Check that the public object is current and references this refresh's files:

```sh
node --input-type=module -e "const url='https://pub-4f2a0555b3314f2b83bb90e44ea586f3.r2.dev/dashboard-data.json?verify='+Date.now(); const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('R2 returned HTTP '+r.status); const d=await r.json(); console.log(JSON.stringify({generatedAt:d.generatedAt,sources:d.sources,historicalAgents:d.historical?.agents?.length},null,2));"
```

Confirm HTTP 200, the new `generatedAt`, the expected source filenames, and
nonzero historical agent counts. The query string avoids reading a cached
response. Report the result and any parser warnings to the user.

## Environment Notes (Windows workstation)

- Node.js lives at `C:\Users\Yufeng.Liang\AppData\Local\node-v22.23.3-win-x64`
  (in the User PATH, but agent shells may not inherit it). Prepend it:
  `$env:Path = "C:\Users\Yufeng.Liang\AppData\Local\node-v22.23.3-win-x64;$env:Path"`.
- If `npm run sync:reports` fails with `'tsx' is not recognized`, run
  `npm install` once to restore `node_modules/.bin`.
- No `bash`, no admin privileges. Do not rely on bash-based npm scripts.
- Automation-browser downloads are configured to save directly into
  `sf_reports/`; the user's `Downloads` folder stays empty.

## Repeated Runs

Repeat the browser download, local parse/review, publish, and live verification
steps for each refresh. Old timestamped files are not deleted automatically;
keep them so source selection stays deterministic. The scheduled authentication
flow remains future work.
