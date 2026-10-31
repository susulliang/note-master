/**
 * Compatibility entry point. The renderer was split into modules under
 * `src/lib/commune/` — import from there for new code; this shim keeps the
 * existing `@/lib/commune-three-renderer` imports (CommunePanel etc.) stable.
 */
export { CommuneThreeRenderer } from './commune/three-renderer';
export type * from './commune/three-types';
