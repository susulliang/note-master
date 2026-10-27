export type UiFontId = 'default' | 'josefin' | 'lora' | 'montserrat' | 'playwrite';

export const UI_FONT_STORAGE_KEY = 'econoter_global_font';

const CJK_SANS_FONT_STACK =
  "'Noto Sans SC', 'Heiti SC', 'Heiti TC', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";

const DEFAULT_LATIN_STACK =
  "'Elms Sans', 'Bahnschrift', 'LarkHackSafariFont', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Tahoma', 'Arial', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

function withCjkFontStack(latinStack: string): string {
  return `${latinStack}, ${CJK_SANS_FONT_STACK}`;
}

export const UI_FONT_OPTIONS: Array<{
  id: UiFontId;
  label: string;
  family: string;
}> = [
  { id: 'default', label: 'Default (Elms Sans)', family: withCjkFontStack(DEFAULT_LATIN_STACK) },
  { id: 'josefin', label: 'Josefin Sans', family: withCjkFontStack("'Josefin Sans', 'Elms Sans', Arial") },
  { id: 'lora', label: 'Lora', family: withCjkFontStack("'Lora', Georgia") },
  { id: 'montserrat', label: 'Montserrat', family: withCjkFontStack("'Montserrat', 'Elms Sans', Arial") },
  { id: 'playwrite', label: 'Playwrite IT Trad', family: withCjkFontStack("'Playwrite IT Trad', 'Elms Sans', Arial") },
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
