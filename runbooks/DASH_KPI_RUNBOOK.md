# Dash KPI Widget Refresh Runbook (KPI Money Go High!)

Updates the Dash **Scorecard** (KPI widget) from the Lark scorecard sheet
"KPI Money Go High!" — <https://lmgx8md8u1.feishu.cn/wiki/I3rMwn5JJiXxByk0vQWcfGa2nSi>.
The wiki link resolves to a spreadsheet; use the **first** sheet tab
(currently `Crazy New 2.0 (Oct 2026)`, sheet_id `RuKJzV` — re-check with
`+workbook-info` each run; a new month gets a new tab).

## Scope of a refresh — rows 1–4, columns A–H

| Row | Content |
|---|---|
| 1 | Title block: `KPI` (A1), period label (G1, e.g. `October`), score label (H1, e.g. `V3 SCORE`) |
| 2 | Column headers: KPI / (blank) / Challenge / Target / Threshold / Weight / Achievement / Score |
| 3 | First KPI row — category, name, challenge, target, threshold, weight, achievement, score |
| 4 | Second KPI row (category blank = inherits row 3's category) |

> The full sheet table actually continues (rows 5–12: remaining KPIs,
> row 13: `得分 = SUM(H3:H12)`, row 14: `结算系数` formula). This runbook only
> refreshes rows 1–4; if rows 5+ also changed, extend the pull the same way.

## Formula rule (never hardcode calculated values)

If a source cell is a **formula** in the sheet, keep computing it — do not copy
a snapshot number as if it were input. Concretely:

- **Achievement (G)** — usually a raw input, but some cells are formulas
  (e.g. Bad Reviews `=3/53`, Attrition `=1/((38+37)/2)*100%`). Record the
  formula in the refresh notes and evaluate it; don't invent a value.
- **Score (H)** — always a formula. Capture and apply it instead of hardcoding:
  - higher-is-better:
    `=IF(G>=$C, $F*100*1.05, IF(G>=$D, $F*100, IF(G<$E, 0, (1-($D-G)/$D)*$F*100)))`
  - lower-is-better:
    `=IF(G<=$C, $F*100*1.05, IF(G<=$D, $F*100, IF(G>$E, 0, (1-(G-$D)/$D)*$F*100)))`
- **Total score** — `=SUM(H3:H12)` (recompute from the resulting scores).
- **Settlement coefficient** — `=IF(total>100, 1.05, IF(total>90, 1, IF(total>85, 0.95, 0.9)))`.

Percent cells arrive as formatted strings (`96%`) — store as numbers ×100
(`96`), matching the existing `scripts/money-go-high.json` shape.

## Step 1 — Read the sheet

```sh
lark-cli sheets +workbook-info --as user --url "<WIKI_URL>"        # pick the current month tab + revision
lark-cli sheets +cells-get --as user --url "<WIKI_URL>" \
  --sheet-id <SHEET_ID> --range A1:H4 --include value,formula
```

Use the workbook's `revision` and `modified_time` for the JSON `source` block.

## Step 2 — Update `scripts/money-go-high.json`

- Map rows 3–4 into `kpis[]` (match by `name`, keep `direction`/`format`).
- Recompute `score` for each touched row with the formulas above (keep ~4
  decimals, e.g. QC 92.81 → 9.7695).
- Recompute `totalScore = sum of all kpis[].score` and
  `settlementCoefficient` from its formula.
- Update `source.revision` / `source.updatedAt`.
- Cross-check: the resulting `totalScore` must equal the sheet's `H13` value;
  if it doesn't, rows 5–12 also changed — re-read `A5:H14` and extend the
  update (do not fudge `totalScore`).

## Step 3 — Publish scorecard-only update to R2

```sh
cd /Users/susul/Dev/econote/note-master
HTTPS_PROXY=http://127.0.0.1:7897 R2_BUCKET=eco-dash npm run publish:money-go-high
```

This validates KPI totals, merges into the live R2 `dashboard-data.json`
(bucket `eco-dash`), and uploads.

## Step 4 — Verify

```sh
node --input-type=module -e "const r=await fetch('https://pub-4f2a0555b3314f2b83bb90e44ea586f3.r2.dev/dashboard-data.json?verify='+Date.now(),{cache:'no-store'}); const d=await r.json(); console.log(JSON.stringify({generatedAt:d.generatedAt, mgh:d.moneyGoHigh},null,2));"
```

Confirm the new `generatedAt`, updated achievement/score/total, and the new
`source.revision`. In-app: Dash → Scorecard shows the refreshed numbers.
