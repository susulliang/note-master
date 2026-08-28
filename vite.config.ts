import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
