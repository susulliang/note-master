#!/usr/bin/env bash
# =============================================================================
# Tauri desktop build + code signing helper
#
# Produces signed desktop bundles for the current host platform:
#   - macOS (arm64 / x86_64):  .app + .dmg   (ad-hoc signed by default)
#   - Windows (x86_64):         .msi + .exe   (unsigned by default)
#
# SIGNING
#   macOS:
#     Ad-hoc (default) — app runs on the build machine without Gatekeeper
#     prompts. For distribution to OTHER Macs, export a Developer ID and
#     notarization credentials:
#
#       export TAURI_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#       export APPLE_ID="you@example.com"
#       export APPLE_PASSWORD="app-specific-password"   # https://appleid.apple.com
#       export APPLE_TEAM_ID="TEAMID"
#
#     With APPLE_ID set, Tauri notarizes the .app and staples the ticket
#     automatically, so end users can open it with no "unverified developer"
#     warning.
#
#   Windows:
#     Without a code-signing certificate the installer still builds, but
#     Windows SmartScreen shows "Windows protected your PC" (click
#     More info → Run anyway). To avoid that, export an Authenticode cert:
#
#       export TAURI_SIGNING_PRIVATE_KEY="/abs/path/to/cert.pfx"
#       export TAURI_SIGNING_KEYSTORE_PASSWORD="pfx-password"
#       export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="pfx-password"
#
# USAGE
#   scripts/tauri-build.sh [target]
#     target: mac | mac-x64 | win | all (default: current host)
#
# Examples:
#   scripts/tauri-build.sh            # build for the host platform
#   scripts/tauri-build.sh mac        # force macOS arm64
#   scripts/tauri-build.sh win        # force Windows x64 (must run on Win or cross-compile)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-host}"

echo "🚀 Tauri desktop build — target: $TARGET"
echo "   Node: $(node --version) | Rust: $(rustc --version | awk '{print $2}')"

# --- Sanity: ensure the frontend builds first -----------------------------
echo "→ Running frontend build (vite)…"
npx vite build --outDir dist/client --emptyOutDir

# --- Build for the requested target ---------------------------------------
case "$TARGET" in
  mac)
    rustup target add aarch64-apple-darwin
    npx tauri build --target aarch64-apple-darwin
    ;;
  mac-x64)
    rustup target add x86_64-apple-darwin
    npx tauri build --target x86_64-apple-darwin
    ;;
  win)
    rustup target add x86_64-pc-windows-msvc
    npx tauri build --target x86_64-pc-windows-msvc
    ;;
  all|host)
    npx tauri build
    ;;
  *)
    echo "❌ Unknown target: $TARGET" >&2
    echo "   Valid targets: mac | mac-x64 | win | all" >&2
    exit 1
    ;;
esac

# --- Locate the bundles ---------------------------------------------------
BUNDLE_DIR="src-tauri/target/release/bundle"
echo ""
echo "✅ Build complete. Outputs:"
find "$BUNDLE_DIR" -maxdepth 3 -type f \( -name "*.app" -o -name "*.dmg" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null | while read -r f; do
  size="$(du -h "$f" | cut -f1)"
  echo "   $size  $f"
done

echo ""
echo "ℹ️  Signing status:"
if [ -n "${TAURI_SIGNING_IDENTITY:-}" ]; then
  echo "   macOS: signed with $TAURI_SIGNING_IDENTITY"
  if [ -n "${APPLE_ID:-}" ]; then
    echo "   macOS: notarized (APPLE_ID=$APPLE_ID)"
  else
    echo "   macOS: NOT notarized — set APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID for distribution"
  fi
else
  echo "   macOS: ad-hoc signed (runs locally; set TAURI_SIGNING_IDENTITY for distribution)"
fi
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "   Windows: signed with $TAURI_SIGNING_PRIVATE_KEY"
else
  echo "   Windows: unsigned (SmartScreen may warn; set TAURI_SIGNING_PRIVATE_KEY + password)"
fi
