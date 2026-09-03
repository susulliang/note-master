/** Single version string shared between the Ticket Notes web-app UI and the
 *  browser extension. Wired through the bump script
 *  (`scripts/bump-version.mjs`) so every patch bump of the extension also
 *  bumps package.json and the UI badge in the Engine settings panel footer.
 *
 *  Vite resolves `.json` imports at build/dev time automatically, so no
 *  custom plugin is needed. When the build writes extension/version.json it
 *  rebuilds and injects the new value here. */
import meta from '../../extension/version.json';

export const APP_VERSION: string = String(meta?.version ?? '0.1.0');
export const APP_RELEASED_AT: string = String(meta?.releasedAt ?? '');
