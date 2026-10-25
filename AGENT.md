# AGENT.md — Agent Operating Notes (note-master)

Pointers to the runbooks an agent should follow for frequent recurring data
updates. All runbooks live in [`runbooks/`](runbooks/). Read the runbook fully
before executing; each is idempotent and safe to re-run.

## Runbooks

| Task | Runbook | Trigger |
|---|---|---|
| Refresh News & Updates knowledge base from Feishu groups (知识点分享群 / General / 流程相关) | [runbooks/NEWS_REFRESH_RUNBOOK.md](runbooks/NEWS_REFRESH_RUNBOOK.md) | New knowledge announcements in the source chats |
| Re-publish Dash board data (Salesforce report downloads → parse → D1/R2) | [runbooks/REPORT_REFRESH_RUNBOOK.md](runbooks/REPORT_REFRESH_RUNBOOK.md) | Fresh SF report exports in `sf_reports/` |
| Refresh Dash Scorecard KPIs from the "KPI Money Go High!" Lark sheet (rows 1–4, A–H) | [runbooks/DASH_KPI_RUNBOOK.md](runbooks/DASH_KPI_RUNBOOK.md) | KPI sheet updated in Feishu |
| Background on the Dash publishing design | [DASHBOARD_DATA_PUBLISHING.md](DASHBOARD_DATA_PUBLISHING.md) | Reference only, not a procedure |

## Hard rules that apply to every runbook

- **Wrangler needs the proxy** on this machine: prefix commands with
  `HTTPS_PROXY=http://127.0.0.1:7897`.
- **Version pinning**: the pre-push hook auto-bumps and may down-bump if
  `extension/version.json` is stale — pin with `npm run bump -- --set <version>`
  when needed.
- **Deploy target**: Cloudflare Workers (`npm run build && npx wrangler deploy`),
  auto-deploy also runs on GitHub main pushes via Actions. Live URL:
  https://note-master.econote.workers.dev
- **Deploy convention**: commit + push all uncommitted local changes first,
  then build/deploy; keep `package.json` and `extension/version.json` in sync.

## Key conventions

- Knowledge markdown bundles (`news/`, `SOP/`, `software_updates/`) are the
  offline fallback; D1 is the source of truth. Any bundle change must be
  followed by its D1 import step in the runbook.
- News markdown files MUST be date-prefixed ASCII slugs — loaders and the
  import script silently skip files without the `YYYY-MM-DD-` prefix.
- Images referenced in markdown go in the matching `assets/` folder
  (`news/assets/`), linked as `![](assets/filename.ext)`, compressed < 300 KB.
