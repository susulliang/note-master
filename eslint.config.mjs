import { globalIgnores } from 'eslint/config'
import { eslintPresets } from '@lark-apaas/coding-presets-react'

export default [
  // `*.js` siblings inside src/ are build artifacts (the Vite side-compiler
  // mirrors .ts/.tsx sources to plain .js so some extension contexts can
  // import without a TS loader). They MUST not be linted as source — the
  // TSX they came from is the canonical source of truth.
  globalIgnores(['dist', '**/components/ui/**', 'src/**/*.js', 'src/**/*.cjs', 'src/**/*.mjs']),
  ...eslintPresets.client,
]
