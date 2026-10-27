export type SheetFill = 'none' | 'slate' | 'blue' | 'mint' | 'amber' | 'rose' | 'violet';
export type SheetTextColor = 'auto' | 'blue' | 'green' | 'red' | 'violet';
export type SheetAlignment = 'left' | 'center' | 'right';

export interface SheetCellStyle {
  fill?: SheetFill;
  color?: SheetTextColor;
  bold?: boolean;
  align?: SheetAlignment;
}

export interface SheetCell {
  row: number;
  col: number;
  raw: string;
  style: SheetCellStyle;
}

export type SheetCellMap = Record<string, SheetCell>;

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function columnLabel(col: number): string {
  let value = col;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function cellAddress(row: number, col: number): string {
  return `${columnLabel(col)}${row}`;
}
