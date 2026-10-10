#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

required=(CLOUDFLARE_ACCOUNT_ID R2_BUCKET)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler CLI is required. Install it with: npm install --global wrangler@4" >&2
  exit 1
fi

REQUIRE_COMPLETE_DASHBOARD_DATA=1 npm --prefix "$ROOT" run sync:reports

wrangler r2 object put \
  "${R2_BUCKET}/${DASHBOARD_DATA_KEY:-dashboard-data.json}" \
  --file "$ROOT/dashboard_publish/dashboard-data.json" \
  --remote \
  --content-type "application/json" \
  --cache-control "public, max-age=300, s-maxage=300" \
  --force

echo "Published dashboard snapshot to R2 object: ${DASHBOARD_DATA_KEY:-dashboard-data.json}"
