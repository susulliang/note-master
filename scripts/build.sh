#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ---------------------------------------------------------------------------
# Environment passthrough for Miaoda PaaS platform env vars (harmless elsewhere)
#   MIAODA_APP_ID            → /app/<appId> as client base path
#   MIAODA_RESOURCE_CDN_PREFIX → assets (JS/CSS) CDN prefix
# ---------------------------------------------------------------------------
export CLIENT_BASE_PATH="${MIAODA_APP_ID:+/app/$MIAODA_APP_ID}"
export ASSETS_CDN_PATH="${MIAODA_RESOURCE_CDN_PREFIX:-/}"
export STATIC_ASSETS_BASE_URL="${MIAODA_STATIC_CDN_PREFIX}"
export NODE_ENV="${NODE_ENV:-production}"

# ---------------------------------------------------------------------------
# Vercel / standalone deployment path
#   On Vercel we want the bundle to live at dist/client/ so that vercel.json
#   can serve it as a static SPA. We skip the Miaoda-specific 4-dir re-layout
#   (and its rsync dependency, which is missing on Vercel's build image).
# ---------------------------------------------------------------------------
if [ -n "${VERCEL}" ] || [ "${DEPLOY_TARGET:-}" = "standalone" ]; then
  echo "🚀 Standalone/Vercel build mode — producing plain dist/client/"

  rm -rf "$ROOT/dist"

  npx vite build --outDir "$ROOT/dist/client" --emptyOutDir

  echo "Build complete — static bundle at dist/client/"
  exit 0
fi

# ---------------------------------------------------------------------------
# Miaoda PaaS path — 4-folder output layout
#   dist/output/            HTML + routes.json
#   dist/output_resource/   assets/ (JS / CSS / fonts → uploaded to CDN)
#   dist/output_static/     shared/static/* (excluding source files)
#   dist/output_capabilities/ shared/capabilities/*
# ---------------------------------------------------------------------------
OUTPUT="$ROOT/dist/output"
OUTPUT_RESOURCE="$ROOT/dist/output_resource"
OUTPUT_STATIC="$ROOT/dist/output_static"

rm -rf "$ROOT/dist"

# 1. Vite build → dist/client/
npx vite build --outDir "$ROOT/dist/client" --emptyOutDir

# 2. HTML → dist/output/
mkdir -p "$OUTPUT"
find "$ROOT/dist/client" -maxdepth 1 \( -name '*.html' -o -name 'routes.json' \) -exec cp {} "$OUTPUT/" \;

# 3. assets/ → dist/output_resource/
if [ -d "$ROOT/dist/client/assets" ]; then
  mkdir -p "$OUTPUT_RESOURCE"
  cp -r "$ROOT/dist/client/assets" "$OUTPUT_RESOURCE/"
fi

# 3.5 SOP assets (SOP.md + SOP/assets/*.png|*.jpg|…) — static files served
#     under `${CLIENT_BASE_PATH}/SOP/…` in the browser. This step owns
#     the copy; vite's sopFolderPlugin only runs the middleware in dev.
#     NOTE: Miaoda PaaS has 4 deploy output folders and each one may be
#     served from a different route prefix depending on platform config,
#     so we mirror SOP/ into every output folder to guarantee a hit
#     regardless of which route the browser resolves. Under 4 MB total.
SOP_SRC="$ROOT/SOP"
if [ -d "$SOP_SRC" ]; then
  # 1. Copy SOP/ into every deploy output folder (base-root SOP/ path)
  for dst in "$OUTPUT" "$OUTPUT_RESOURCE" "$OUTPUT_STATIC" "$ROOT/dist/output_capabilities"; do
    mkdir -p "$dst"
    cp -r "$SOP_SRC" "$dst/"
  done
  # 2. If Miaoda app base path exists (CLIENT_BASE_PATH = /app/$MIAODA_APP_ID),
  #    also mirror SOP under the scoped subdirectory inside each output
  #    folder so URLs like /app/X123/SOP/assets/image%2054.png resolve,
  #    matching what resolveSopImageSrc produces via BASE_URL.
  if [ -n "${CLIENT_BASE_PATH}" ]; then
    # strip leading '/' to get a relative path inside the output folder
    REL_BASE="${CLIENT_BASE_PATH#/}"
    if [ -n "${REL_BASE}" ]; then
      for dst in "$OUTPUT" "$OUTPUT_RESOURCE" "$OUTPUT_STATIC" "$ROOT/dist/output_capabilities"; do
        target="$dst/$REL_BASE/SOP"
        mkdir -p "$(dirname "$target")"
        # Remove any stale copy so we don't mix old 图片和附件 + new assets
        rm -rf "$target"
        cp -r "$SOP_SRC" "$target"
      done
    fi
  fi
fi

# 4. shared/static → dist/output_static/ (exclude source extensions)
#
# NOTE: we used to use `rsync -a --exclude=…` here, but rsync is not installed
# in Vercel's build image and many minimal Linux containers. Use find + cp
# instead — it's POSIX-standard and ships everywhere.
if [ -d "$ROOT/shared/static" ]; then
  mkdir -p "$OUTPUT_STATIC"
  # Mirror directory structure first (no files yet)
  (cd "$ROOT/shared/static" && find . -type d -exec mkdir -p "$OUTPUT_STATIC/{}" \;)
  # Copy any file whose extension isn't a TS/JS source file
  (cd "$ROOT/shared/static" && find . -type f \
    ! \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) \
    -exec cp -p '{}' "$OUTPUT_STATIC/{}" \;)
fi

# 5. shared/capabilities → dist/output_capabilities/
if [ -d "$ROOT/shared/capabilities" ]; then
  mkdir -p "$ROOT/dist/output_capabilities"
  cp -r "$ROOT/shared/capabilities/." "$ROOT/dist/output_capabilities/"
fi

echo "Build complete"
echo "  HTML         → dist/output/"
[ -d "$OUTPUT_RESOURCE" ] && echo "  Resource     → dist/output_resource/" || true
[ -d "$OUTPUT_STATIC" ] && echo "  Static       → dist/output_static/" || true
[ -d "$ROOT/dist/output_capabilities" ] && echo "  Capabilities → dist/output_capabilities/" || true
