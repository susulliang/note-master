import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Temporary dev config: bypasses @lark-apaas/coding-preset-vite-react (incompatible
// with Vite 8 ESM) and provides stubs the toolkit expects at runtime.
// NOTE: @tailwindcss/vite is required — without it, `@import "tailwindcss"` in
// index.css is not compiled and utility classes (bg-background, etc.) are no-ops.
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'ecovacs-dev-stubs',
      resolveId(id) {
        if (id === 'virtual:capabilities') return '\0virtual:capabilities'
        return null
      },
      load(id) {
        if (id === '\0virtual:capabilities') {
          return 'export default {}; export const capabilities = {};'
        }
        return null
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  define: {
    'process.env': '{}',
    'process.platform': '"browser"',
    'process.version': '""',
  },
  server: {
    port: 8001,
    host: '0.0.0.0',
  },
})
