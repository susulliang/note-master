/**
 * Shared version sync — writes ONE version string into every place the
 * Ticket Notes app or extension ships it, so the extension popup header,
 * install guide, `manifest.json`, `package.json`, and the Engine Settings
 * Panel footer (in the React app) always match exactly.
 *
 *   npm run bump              — bump PATCH (default; runs automatically on
 *                               every `git push` via the .githooks/pre-push
 *                               hook so every push increments the last digit)
 *   npm run bump -- --minor   — bump MINOR (new feature tier)
 *   npm run bump -- --major   — bump MAJOR
 *   npm run bump -- --set X   — pin exact version
 *   npm run bump -- --pre-push— pre-push entry: skips entirely if the
 *                               current branch already has a newer version
 *                               than its upstream tracking ref (i.e. a
 *                               previous bump/commit in this push already
 *                               bumped the number).
 *
 * Writes:
 *   1. extension/version.json  — single source of truth (Vite JSON-imported
 *                                 by src/lib/app-version.ts so both sides
 *                                 point at the same bytes on disk)
 *   2. extension/manifest.json — top-level "version" (Chrome MV3 reads it)
 *   3. extension/docs/install.html — human-visible title/footer stamp
 *   4. extension/popup/popup.html — silent <body> comment stamp
 *   5. package.json            — root package "version" field
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const VERSION_JSON = resolve(ROOT, 'extension', 'version.json');
const MANIFEST    = resolve(ROOT, 'extension', 'manifest.json');
const INSTALL     = resolve(ROOT, 'extension', 'docs', 'install.html');
const POPUP_HTML  = resolve(ROOT, 'extension', 'popup', 'popup.html');
const PKG_JSON    = resolve(ROOT, 'package.json');

function parseArgv(argv) {
  const out = { minor: false, major: false, set: null, prePush: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--minor') out.minor = true;
    else if (a === '--major') out.major = true;
    else if (a === '--pre-push') out.prePush = true;
    else if (a === '--set') { out.set = argv[i + 1] || null; i += 1; }
    else if (a.startsWith('--set=')) out.set = a.slice('--set='.length);
  }
  return out;
}

function readCurrent() {
  if (!existsSync(VERSION_JSON)) {
    try {
      const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
      return m.version || '0.1.0';
    } catch { return '0.1.0'; }
  }
  return JSON.parse(readFileSync(VERSION_JSON, 'utf8')).version;
}

function bump(sem, args) {
  const [M, m, p] = sem.split(/[\.\-+]/, 3).map((x) => parseInt(x, 10) || 0);
  if (args.set) return /^\d+\.\d+\.\d+$/.test(args.set) ? args.set : sem;
  if (args.major) return `${M + 1}.0.0`;
  if (args.minor) return `${M}.${m + 1}.0`;
  return `${M}.${m}.${p + 1}`;
}

function replaceBetween(src, openTag, closeTag, insert) {
  const open = src.indexOf(openTag);
  const close = src.indexOf(closeTag, open === -1 ? 0 : open + openTag.length);
  if (open === -1 || close === -1) return src;
  return src.slice(0, open + openTag.length) + insert + src.slice(close);
}

function git(cmd) {
  try {
    return String(execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch { return ''; }
}

/** True when the on-disk version equals what the upstream tracking ref has
 *  committed in extension/version.json. When equal, no commit in the
 *  pending push has bumped yet → pre-push hook must auto-patch-bump so
 *  every push strictly increases the last digit. When the local branch has
 *  no configured @{u} (common on fresh clones that push without `--set-upstream`
 *  first), we fall back to `origin/main` because that's the integration
 *  branch this repo consistently uses. */
function sameVersionAsUpstream() {
  let ref = git('git rev-parse --abbrev-ref @{u}');
  if (!ref) {
    // No per-branch upstream tracking: pick the origin-default integration
    // branch we'd actually push to.
    const originHead = git('git symbolic-ref refs/remotes/origin/HEAD 2>nul');
    ref = originHead ? originHead.replace(/^refs\//, '').trim() : 'origin/main';
  }
  const upstreamJson = git(`git show ${ref}:extension/version.json 2>nul`);
  if (!upstreamJson) return false;
  try {
    const upstreamVer = JSON.parse(upstreamJson).version;
    return upstreamVer === readCurrent();
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.prePush && !sameVersionAsUpstream()) {
    // Head is already ahead of upstream on version — skip, the user either
    // manually bumped or a previous commit in this push already did the
    // patch increment via hook.
    console.log('[version] already bumped vs upstream — skipping auto bump.');
    process.exit(0);
  }

  const cur = readCurrent();
  const next = bump(cur, args);
  const stamp = new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z');

  // 1. extension/version.json (single source of truth)
  const meta = { version: next, releasedAt: stamp };
  writeFileSync(VERSION_JSON, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  // 2. extension/manifest.json
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  manifest.version = next;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 3. install.html — rewrite two spots:
  //      a) Tiny comment stamp after </title> so version diffs are visible.
  //         Marker:  </title><!-- VERSION …content…<END_VERSION -->
  //      b) Rewrite the WHOLE <p class="sub"> sub-header line in-place so the
  //         version stamp (Extension build X · Y · reload hint) is rendered
  //         visibly to the reader, followed by the static sub-header text.
  //         No markers inside the sub-header — simpler and can't grow tags.
  let html = readFileSync(INSTALL, 'utf8');
  html = replaceBetween(html, '<title>Ecovacs Note Helper — Install Guide</title><!-- VERSION', '<END_VERSION -->',
    ` v${next} — ${stamp}`);
  const subLine =
    `<p class="sub"><strong>Extension build ${next}</strong> · ${stamp}. Reload extension on <code>chrome://extensions</code> / <code>edge://extensions</code> after updating. &nbsp;·&nbsp; Manifest V3 browser extension for Ecovacs NA agents: scrapes the Salesforce Case tab (and embedded phone panel) and pushes fields to Ticket Notes. <span class="badge ok">Tier-2 MV3</span></p>`;
  html = html.replace(/<p class="sub">[\s\S]*?<\/p>/, subLine);
  writeFileSync(INSTALL, html, 'utf8');

  // 4. popup.html build stamp — same sentinel close tag.
  let popup = readFileSync(POPUP_HTML, 'utf8');
  const marker = '<!-- BUILD_STAMP>';
  const endMarker = '<END_BUILD_STAMP -->';
  const stampContent = `${next}@${stamp}`;
  if (popup.includes(marker)) {
    popup = replaceBetween(popup, marker, endMarker, stampContent);
  } else {
    popup = popup.replace('</body>', `  ${marker}${stampContent}${endMarker}\n</body>`);
  }
  writeFileSync(POPUP_HTML, popup, 'utf8');

  // 5. package.json — keep root package version synced so `npm view / npm
  //    version`-reading tools show the same build.
  const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));
  if (pkg.version !== next) {
    pkg.version = next;
    writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  const kind = args.prePush
    ? 'auto via pre-push hook'
    : args.set ? `pinned (${args.set})`
    : args.major ? 'major'
    : args.minor ? 'minor'
    : 'patch';
  console.log(`[version] ${cur} → ${next}  (${kind})`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
