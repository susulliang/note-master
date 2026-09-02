import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves the workspace-level SOP/ folder (SOP.md + assets/) under the
 * app-base-scoped URL prefix `${base}SOP/*` during `vite dev` only.
 *
 * SopPanel's `resolveSopImageSrc` produces `${BASE_URL}SOP/…` URLs,
 * matching this middleware's accepted prefix. For production builds the
 * SOP folder is copied into every deploy output folder by
 * `scripts/build.sh` directly (it has the authoritative ROOT path and
 * knows the 4-folder Miaoda layout) rather than via this plugin's
 * closeBundle hook — some container/cwd combinations cause
 * `configResolved` to report a nested ROOT that places outputs in a
 * phantom subdir, so the shell script (which runs at the real repo root)
 * is the only trustworthy copier. The closeBundle hook is retained as a
 * best-effort safety net but build.sh owns the copy step.
 */
function sopFolderPlugin(): Plugin {
  const SOP_URL_SEGMENT = 'SOP';
  let basePrefix = '/';

  return {
    name: 'ecovacs-sop-folder',
    configResolved(config) {
      const b = config.base || '/';
      basePrefix = b.endsWith('/') ? b : b + '/';
    },
    configureServer(server) {
      // NOTE: use process.cwd() (which inside `vite` dev at repo root is
      // correct) — not config.root, because some Miaoda wrappers set a
      // synthetic root that misses the /workspace/SOP folder.
      const sopRoot = path.join(process.cwd(), 'SOP');
      server.middlewares.use((req, _res, next) => {
        const rawUrl = (req.url ?? '').split('?')[0]!;
        let rel: string | null = null;
        const basePrefixed = basePrefix + SOP_URL_SEGMENT;
        if (rawUrl.startsWith(basePrefixed + '/') || rawUrl === basePrefixed) {
          rel = decodeURIComponent(rawUrl.slice(basePrefixed.length + 1));
        } else {
          const absPrefixed = '/' + SOP_URL_SEGMENT;
          if (rawUrl.startsWith(absPrefixed + '/') || rawUrl === absPrefixed) {
            rel = decodeURIComponent(rawUrl.slice(absPrefixed.length + 1));
          }
        }
        if (rel !== null) {
          const target = path.normalize(path.join(sopRoot, rel));
          if (target.startsWith(sopRoot) && existsSync(target)) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const fs = require('node:fs');
            const statSync = fs.statSync(target);
            if (statSync.isFile()) {
              const contentType = contentTypeFor(target);
              _res.setHeader('Content-Type', contentType);
              _res.setHeader('Cache-Control', 'public, max-age=3600');
              return fs.createReadStream(target).pipe(_res);
            }
          }
        }
        next();
      });
    },
    async closeBundle() {
      // Best-effort fallback — see the doc comment above: the real copy
      // step lives in scripts/build.sh (step 3.5) and always runs there.
      // This hook only runs when `vite build` is invoked directly
      // (standalone/vercel) and only fires if `scripts/build.sh` hasn't
      // already produced the same folder.
      const sopSrc = path.join(process.cwd(), 'SOP');
      // config.build.outDir might be a relative path. resolve via cwd.
      // We can't read it from configResolved here — closeBundle's this
      // value isn't a plugin ctx with direct access; infer from common.
      const outDirRel = 'dist/client';
      try {
        await stat(sopSrc);
        const bases = ['/', basePrefix];
        const seen = new Set<string>();
        for (const b of bases) {
          const sub = (b === '/' ? '' : b.replace(/^\/+/, '')) + SOP_URL_SEGMENT;
          const dst = path.resolve(process.cwd(), outDirRel, sub);
          const norm = path.normalize(dst);
          if (seen.has(norm)) continue;
          seen.add(norm);
          await mkdir(path.dirname(norm), { recursive: true });
          cpSync(sopSrc, norm, { recursive: true, errorOnExist: false });
          this.info?.(`ecovacs-sop-folder: copied ${sopSrc} → ${norm}`);
        }
      } catch (e) {
        // Non-fatal: build.sh will retry at repo-root immediately after.
        this.warn?.(`ecovacs-sop-folder: closeBundle copy skipped (${String(e)})`);
      }
    },
  };
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Takes over every `*.md?raw` static import issued from
 * `src/utils/_productMdImports.ts` (8198 imports).
 *
 * Why this is needed (as of Vite 8.1.4 / rolldown builtin bundler on Vercel):
 *
 *   1. rolldown fails `[UNRESOLVED_IMPORT]` for any import specifier that
 *      contains CJK characters, spaces or parentheses (even though the files
 *      exist on disk). ~9 of our 59 core products/*.md files have Chinese
 *      filenames with spaces.
 *   2. The `?raw` Vite suffix must live INSIDE the quoted module specifier
 *      (we already fixed the generator for that), but rolldown's native
 *      resolver runs BEFORE the builtin `?raw` transform and tries to find
 *      a file on disk whose name literally ends with `.md?raw` — that file
 *      obviously doesn't exist, so it reports UNRESOLVED_IMPORT for
 *      EVERY SINGLE static ?raw import (8198 total, including the 8139 FAQ
 *      files whose names are pure ASCII).
 *
 * This plugin short-circuits rolldown's resolver for every .md?raw import
 * by:
 *   a) resolving the specifier (including any ?raw suffix) to an absolute
 *      disk path relative to the importer file, and
 *   b) emitting a virtual module (`\0` prefix so rolldown skips fs resolve)
 *      whose code is `export default "<file content as JSON string>"` —
 *      exactly equivalent to Vite's own ?raw semantics.
 */
function mdRawStaticImportResolverPlugin(): Plugin {
  const VIRTUAL_PREFIX = '\0ecovacs-md-raw:';
  // Warm cache — 8198 files read many times in dev HMR cycles, so skip
  // redundant FS calls on the same path.
  const fileContentCache = new Map<string, string>();

  return {
    name: 'ecovacs-md-raw-resolver',
    enforce: 'pre', // intercept BEFORE rolldown builtin resolver / vite ?raw
    resolveId(id: string, importer?: string) {
      // Short-circuit only the pattern we own: "<anything>.md?raw",
      // issued from our static imports file.
      if (!id.endsWith('.md?raw')) return null;
      if (importer && !importer.includes('_productMdImports')) return null;

      // Strip ?raw suffix robustly (no off-by-one on CJK string lengths).
      const mdRel = id.replace(/\?raw$/, '');
      if (!importer) return null;

      // Resolve the relative path against the importer file's directory.
      // IMPORTANT: The import in _productMdImports.ts is "../../products/X.md"
      // (two levels up from src/utils/ → repo root). We also keep a fallback
      // path against process.cwd() (known repo root) in case a future change
      // relocates the importer file or adjusts the relative prefix.
      const relativeToImporter = path.resolve(path.dirname(importer), mdRel);
      if (existsSync(relativeToImporter)) {
        return VIRTUAL_PREFIX + relativeToImporter;
      }
      // Fallback: strip leading "../" segments and resolve against cwd.
      const stripped = mdRel.replace(/^(\.\.\/)+/, '');
      const relativeToCwd = path.resolve(process.cwd(), stripped);
      if (existsSync(relativeToCwd)) {
        return VIRTUAL_PREFIX + relativeToCwd;
      }
      // Return null to let the default resolver emit a proper error for
      // genuinely-missing files (we've done everything we reasonably can).
      return null;
    },
    load(id: string) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;
      const absPath = id.slice(VIRTUAL_PREFIX.length);
      const cached = fileContentCache.get(absPath);
      if (cached !== undefined) return cached;
      let raw: string;
      try {
        raw = readFileSync(absPath, 'utf8');
      } catch (e) {
        this.error(`ecovacs-md-raw: cannot read ${absPath} (${String(e)})`);
        return null;
      }
      const out = `export default ${JSON.stringify(raw)};`;
      fileContentCache.set(absPath, out);
      return out;
    },
  };
}

/**
 * Canonical Vite config — used by both `vite` (dev) and `vite build` (prod).
 *
 * Previously this project consumed `@lark-apaas/coding-preset-vite-react`,
 * which injected Miaoda platform plugins (polyfills generator, Feishu fonts
 * mirror, a custom reporter, and a 4-folder deploy output layout). Those are
 * only useful for the Miaoda/Feishu PaaS host, and specifically break public
 * standalone deployments such as Vercel:
 *
 *   - miaoda-polyfills.js         → ~53 kB of unused ES-level polyfills
 *   - miaoda-fonts-mirror         → rewrites Google Fonts URLs to Feishu-internal
 *                                    host (miaoda.feishu.cn/fonts)
 *   - scripts/build.sh uses rsync → fails on Vercel (rsync isn't installed)
 *   - 4-dir output under dist/    → doesn't match Vercel's static output model
 *
 * This config keeps things vanilla Vite + React + Tailwind so the resulting
 * dist/client/ is a drop-in static SPA bundle that Vercel can deploy directly.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Miaoda-to-env passthrough (harmless on Vercel — will just be "/")
  const base = env.MIAODA_APP_ID ? `/app/${env.MIAODA_APP_ID}` : '/';

  return {
    plugins: [
      tailwindcss(),
      react(),
      sopFolderPlugin(),
      mdRawStaticImportResolverPlugin(),
      {
        name: 'ecovacs-capabilities-stub',
        resolveId(id) {
          if (id === 'virtual:capabilities') return '\0virtual:capabilities';
          return null;
        },
        load(id) {
          if (id === '\0virtual:capabilities') {
            return 'export default {}; export const capabilities = {};';
          }
          return null;
        },
      },
    ],
    base,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    // The local-Whisper transcribe worker imports @huggingface/transformers
    // (ESM with dynamic backend loading) — it must stay an ES-module worker,
    // and esbuild pre-bundling mangles the ORT wasm loader, so exclude it.
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },
    define: {
      // Some transitive dependencies of the shadcn/ui scaffolding still read
      // `process.env`; the browser bundle should treat it as an empty object.
      'process.env': '{}',
      'process.platform': '"browser"',
      'process.version': '""',
    },
    build: {
      // Rolldown (Vite 8 default) — enable fine-grained code splitting so
      // heavy vendor chunks (lucide-react, echarts, recharts, radix, ...) are
      // split across multiple files instead of creating a single monolith.
      // This also suppresses the "chunk > 500 kB" warning.
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      chunkSizeWarningLimit: 1500,
      sourcemap: false,
      outDir: 'dist/client',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Granular manual chunks — grouped by library family so the code-split
          // cache ratio is optimal: radix + lucide are the most volatile in dev.
          manualChunks(id) {
            const rel = path.relative(process.cwd(), id);
            if (rel.includes('node_modules' + path.sep + 'lucide-react')) return 'vendor-lucide';
            if (rel.includes('node_modules' + path.sep + '@radix-ui')) return 'vendor-radix';
            if (rel.includes('node_modules' + path.sep + 'echarts')) return 'vendor-echarts';
            if (rel.includes('node_modules' + path.sep + 'recharts')) return 'vendor-recharts';
            if (rel.includes('node_modules' + path.sep + 'react-router')) return 'vendor-router';
            if (rel.includes('node_modules' + path.sep + 'react-hook-form')) return 'vendor-hook-form';
            if (rel.includes('node_modules' + path.sep + 'framer-motion')
              || rel.includes('node_modules' + path.sep + 'gsap')
              || rel.includes('node_modules' + path.sep + '@gsap')) return 'vendor-motion';
            if (rel.includes('node_modules' + path.sep + 'react-dom')
              || rel.includes('node_modules' + path.sep + 'react' + path.sep)) return 'vendor-react';
            if (rel.includes('node_modules' + path.sep + 'zod')
              || rel.includes('node_modules' + path.sep + '@hookform')) return 'vendor-form';
            if (rel.includes('node_modules' + path.sep)) return 'vendor-other';
            return undefined;
          },
        },
      },
    },
    server: {
      port: Number(env.CLIENT_DEV_PORT) || 8001,
      host: '0.0.0.0',
    },
    preview: {
      port: Number(env.CLIENT_DEV_PORT) || 8001,
      host: '0.0.0.0',
    },
  };
});
