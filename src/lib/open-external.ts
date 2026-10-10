/**
 * Open a URL in the system default browser.
 *
 * In the Tauri desktop shell (WKWebView) `window.open` and
 * `<a target="_blank">` are silently blocked, so external links are routed
 * through the opener plugin instead. In the browser this is a plain
 * window.open. Falls back to window.open if the plugin call fails.
 */
import { isTauriEnv } from './tauri-env';

export async function openExternal(url: string): Promise<void> {
  if (isTauriEnv()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:opener|open_url', { url });
      return;
    } catch {
      // plugin unavailable / denied — fall through to window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
