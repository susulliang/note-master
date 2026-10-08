import { useState } from 'react';

/**
 * macOS native-window drag bar (Tauri desktop only).
 *
 * With `decorations: false` in tauri.conf.json the OS title bar is gone, so
 * the app needs its own drag region. This 20px-tall invisible bar sits at
 * the very top of the window and carries `data-tauri-drag-region` — Tauri
 * treats pointer events inside it as window-drag gestures.
 *
 * Hovering the bar fades in the app name centered; otherwise it's fully
 * transparent so the app's own content shows through.
 */
export default function DragBar() {
  const [hover, setHover] = useState(false);
  return (
    <div
      data-tauri-drag-region
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="fixed inset-x-0 top-0 z-[60] flex h-5 items-center justify-center bg-transparent"
    >
      <span
        className={
          'select-none text-[11px] font-semibold tracking-wide text-foreground/50 transition-opacity duration-200 ' +
          (hover ? 'opacity-100' : 'opacity-0')
        }
      >
        Ecovacs Ticket Notes
      </span>
    </div>
  );
}
