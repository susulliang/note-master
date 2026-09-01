import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves the workspace-level SOP/ folder (SOP.md + 图片和附件/) under the
 * URL prefix `/SOP/*`. This lets SopPanel render real <img> tags for the
 * reference screenshots — even Chinese filenames and whitespace work because
 * Vite's static middleware does percent-encoding transparently.
 *
 * Two modes:
 *   - dev   : configureServer adds a tiny fs middleware ahead of Vite's.
 *   - build : closeBundle copies `SOP/` into dist/client/SOP/ so the static
 *             bundle ships with images included (Vercel/Cloudflare Pages).
 */
function sopFolderPlugin(): Plugin {
  const SOP_URL_PREFIX = '/SOP';
  let rootDir = process.cwd();
  let outDir = 'dist/client';

  return {
    name: 'ecovacs-sop-folder',
    configResolved(config) {
      rootDir = config.root;
      outDir = config.build.outDir;
    },
    configureServer(server) {
      // Runs before Vite's other middlewares — resolve `/SOP/x/y.ext` to
      // `<root>/SOP/x/y.ext`. Uses Vite's own `fs.cachedRead` via the
      // standard static middleware pattern by redirecting to a "virtual
      // public path": we just pipe the file through the dev server's
      // existing file-serving path so range requests, content-type, etc.
      // are handled correctly.
      const sopRoot = path.join(rootDir, 'SOP');
      server.middlewares.use((req, _res, next) => {
        const url = (req.url ?? '').split('?')[0]!;
        if (url.startsWith(SOP_URL_PREFIX + '/') || url === SOP_URL_PREFIX) {
          const rel = decodeURIComponent(url.slice(SOP_URL_PREFIX.length + 1));
          const target = path.normalize(path.join(sopRoot, rel));
          if (target.startsWith(sopRoot) && existsSync(target)) {
            req.url = url; // keep original url
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
      const sopSrc = path.join(rootDir, 'SOP');
      const sopDst = path.join(rootDir, outDir, 'SOP');
      try {
        await stat(sopSrc);
        await mkdir(path.dirname(sopDst), { recursive: true });
        // Copy recursively. We always overwrite to get the latest SOP
        // version; build already empties the outDir prior to this.
        cpSync(sopSrc, sopDst, { recursive: true, errorOnExist: false });
        this.info?.(`ecovacs-sop-folder: copied ${sopSrc} → ${sopDst}`);
      } catch (e) {
        // SOP folder missing is not fatal — the SOP markdown is still
        // embedded via the ?raw import and images simply won't resolve.
        this.warn?.(`ecovacs-sop-folder: no SOP source dir at ${sopSrc}`);
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
