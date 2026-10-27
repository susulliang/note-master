export type UiFontId = 'default' | 'josefin' | 'lora' | 'montserrat' | 'playwrite';

export const UI_FONT_STORAGE_KEY = 'econoter_global_font';

const DEFAULT_SANS_STACK =
  "'Elms Sans', 'Bahnschrift', 'LarkHackSafariFont', 'LarkEmojiFont', 'LarkChineseQuote', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Tahoma', 'PingFang SC', 'Microsoft Yahei', 'Arial', 'Hiragino Sans GB', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

const CJK_SANS_FALLBACK = "'Elms Sans', 'Bahnschrift', 'LarkHackSafariFont', 'LarkEmojiFont', 'LarkChineseQuote', 'Microsoft Yahei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

export const UI_FONT_OPTIONS: Array<{
  id: UiFontId;
  label: string;
  family: string;
}> = [
  { id: 'default', label: 'Default (Elms Sans)', family: DEFAULT_SANS_STACK },
  { id: 'josefin', label: 'Josefin Sans', family: `'Josefin Sans', ${CJK_SANS_FALLBACK}` },
  { id: 'lora', label: 'Lora', family: `'Lora', Georgia, 'LarkChineseQuote', 'Microsoft Yahei', serif` },
  { id: 'montserrat', label: 'Montserrat', family: `'Montserrat', ${CJK_SANS_FALLBACK}` },
  { id: 'playwrite', label: 'Playwrite IT Trad', family: `'Playwrite IT Trad', ${CJK_SANS_FALLBACK}` },
];

export function normalizeUiFont(value: unknown): UiFontId {
  return UI_FONT_OPTIONS.find((font) => font.id === value)?.id ?? 'default';
}

export function readUiFontPreference(): UiFontId {
  try {
    return normalizeUiFont(window.localStorage.getItem(UI_FONT_STORAGE_KEY));
  } catch {
    return 'default';
  }
}

export function applyUiFont(value: unknown): UiFontId {
  const id = normalizeUiFont(value);
  const font = UI_FONT_OPTIONS.find((option) => option.id === id)!;
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--ui-font-family', font.family);
  }
  return id;
}

export function saveUiFontPreference(value: unknown): UiFontId {
  const id = applyUiFont(value);
  try {
    window.localStorage.setItem(UI_FONT_STORAGE_KEY, id);
  } catch {
    // Keep the live selection even when storage is unavailable.
  }
  return id;
}
