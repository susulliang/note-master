/**
 * extension/versions sync tool:
 *
 *   npm run ext:bump   — bump PATCH (default, suitable for bug fixes like today)
 *   npm run ext:bump -- --minor  — bump MINOR (new feature tier)
 *   npm run ext:bump -- --major  — bump MAJOR
 *   npm run ext:bump -- --set 0.2.7  — pin to exact version
 *
 * Does THREE things atomically so "version on popup" and "version on
 * install page" and "version in manifest" are always the same:
 *
 *   1. Writes the chosen version into extension/version.json.
 *   2. Rewrites extension/manifest.json's top-level "version" key from that
 *      JSON (one source of truth).
 *   3. Rewrites the inline <title>/<h1> meta footer inside
 *      extension/docs/install.html so the install guide shows the same
 *      release stamp. (Cheap string replace — no parser dependency.)
 *
 * Intended to be run BY the committer (or via precommit hook) every time
 * they edit something under extension/ so the user never installs the
 * popup and still sees "v0.1.0 … warming up…" after a fix has landed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const VERSION_JSON = resolve(ROOT, 'extension', 'version.json');
const MANIFEST    = resolve(ROOT, 'extension', 'manifest.json');
const INSTALL     = resolve(ROOT, 'extension', 'docs', 'install.html');
const POPUP_HTML  = resolve(ROOT, 'extension', 'popup', 'popup.html');

function parseArgv(argv) {
  const out = { minor: false, major: false, set: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--minor') out.minor = true;
    else if (a === '--major') out.major = true;
    else if (a === '--set') { out.set = argv[i + 1] || null; i += 1; }
    else if (a.startsWith('--set=')) out.set = a.slice('--set='.length);
  }
  return out;
}

function readCurrent() {
  if (!existsSync(VERSION_JSON)) {
    // Fall back to manifest if exists.
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

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const cur = readCurrent();
  const next = bump(cur, args);
  const stamp = new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z');

  // 1. version.json (single source of truth)
  const meta = { version: next, releasedAt: stamp };
  writeFileSync(VERSION_JSON, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  // 2. manifest.json
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  manifest.version = next;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 3. install.html — rewrite the <title> suffix and the visible version
  //    badge in the header paragraph so the agent knows which build they loaded.
  let html = readFileSync(INSTALL, 'utf8');
  html = replaceBetween(html, '<title>Ecovacs CCP Scraper — Install Guide</title><!-- VERSION', 'END_VERSION -->',
    ` v${next} — ${stamp}END_VERSION -->`);
  html = replaceBetween(html, '<p class="sub"><!-- VERSION_PARA', 'END_VERSION_PARA --></p>',
    `VERSION_PARA>Extension build <strong>${next}</strong> · ${stamp}. Reload extension on <code>chrome://extensions</code> / <code>edge://extensions</code> after updating.END_VERSION_PARA -->`);
  writeFileSync(INSTALL, html, 'utf8');

  // 4. popup.html — append a tiny comment stamp so reload diffs catch it.
  let popup = readFileSync(POPUP_HTML, 'utf8');
  const marker = '<!-- BUILD_STAMP';
  const endMarker = 'END_BUILD_STAMP -->';
  if (popup.includes(marker)) {
    popup = replaceBetween(popup, marker, endMarker, `BUILD_STAMP>${next}@${stamp}END_BUILD_STAMP -->`);
  } else {
    popup = popup.replace('</body>', `  ${marker}${next}@${stamp}${endMarker}\n</body>`);
  }
  writeFileSync(POPUP_HTML, popup, 'utf8');

  console.log(`[ext-version] ${cur} → ${next}  (${args.set ? 'pinned' : args.major ? 'major' : args.minor ? 'minor' : 'patch'})`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
