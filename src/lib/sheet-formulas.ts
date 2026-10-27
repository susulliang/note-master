import { cellAddress, cellKey, type SheetCellMap } from '@/lib/sheets-types';

type FormulaValue = number | string | FormulaValue[];
type Token = { kind: 'number' | 'string' | 'reference' | 'identifier' | 'operator'; value: string };

const CELL_REFERENCE = /^\$?[A-Z]{1,3}\$?\d+/i;
const NUMBER = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i;

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = input.trim();
  while (rest) {
    if (/^\s+/.test(rest)) {
      rest = rest.replace(/^\s+/, '');
      continue;
    }
    const string = /^"(?:""|[^"])*"/.exec(rest);
    const reference = CELL_REFERENCE.exec(rest);
    const number = NUMBER.exec(rest);
    const identifier = /^[A-Z_][A-Z0-9_.]*/i.exec(rest);
    if (string) {
      tokens.push({ kind: 'string', value: string[0].slice(1, -1).replace(/""/g, '"') });
      rest = rest.slice(string[0].length);
    } else if (reference) {
      tokens.push({ kind: 'reference', value: reference[0] });
      rest = rest.slice(reference[0].length);
    } else if (number) {
      tokens.push({ kind: 'number', value: number[0] });
      rest = rest.slice(number[0].length);
    } else if (identifier) {
      tokens.push({ kind: 'identifier', value: identifier[0].toUpperCase() });
      rest = rest.slice(identifier[0].length);
    } else if (/^[+\-*/^&():,]$/.test(rest[0])) {
      tokens.push({ kind: 'operator', value: rest[0] });
      rest = rest.slice(1);
    } else {
      return null;
    }
  }
  return tokens;
}

function numeric(value: FormulaValue): number | null {
  if (Array.isArray(value)) return null;
  if (typeof value === 'number') return value;
  if (value.startsWith('#')) return null;
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function flatten(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((value) => Array.isArray(value) ? flatten(value) : [value]);
}

function parseAddress(value: string): { row: number; col: number } | null {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(value);
  if (!match) return null;
  let col = 0;
  for (const character of match[1].toUpperCase()) col = col * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  return row > 0 && col > 0 ? { row, col } : null;
}

export function evaluateSheetCell(
  raw: string,
  row: number,
  col: number,
  cells: SheetCellMap,
  stack = new Set<string>(),
): FormulaValue {
  if (!raw.startsWith('=')) {
    if (raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
    return raw;
  }
  const key = cellKey(row, col);
  if (stack.has(key)) return '#CIRCULAR!';
  const tokens = tokenize(raw.slice(1));
  if (!tokens) return '#VALUE!';
  const formulaStack = new Set(stack).add(key);
  let offset = 0;
  const peek = () => tokens[offset];
  const consume = (value?: string) => {
    const token = tokens[offset];
    if (!token || (value && token.value !== value)) return null;
    offset += 1;
    return token;
  };
  const cellValue = (address: string): FormulaValue => {
    const parsed = parseAddress(address);
    if (!parsed || parsed.row > 100 || parsed.col > 100) return '#REF!';
    const cell = cells[cellKey(parsed.row, parsed.col)];
    return cell ? evaluateSheetCell(cell.raw, parsed.row, parsed.col, cells, formulaStack) : '';
  };
  const readPrimary = (): FormulaValue => {
    const token = consume();
    if (!token) return '#VALUE!';
    if (token.value === '(') {
      const value = readExpression();
      if (!consume(')')) return '#VALUE!';
      return value;
    }
    if (token.value === '+' || token.value === '-') {
      const value = readPrimary();
      const parsed = numeric(value);
      return parsed === null ? '#VALUE!' : token.value === '-' ? -parsed : parsed;
    }
    if (token.kind === 'number') return Number(token.value);
    if (token.kind === 'string') return token.value;
    if (token.kind === 'reference') {
      const first = parseAddress(token.value);
      if (!first || first.row > 100 || first.col > 100) return '#REF!';
      if (consume(':')) {
        const secondToken = consume();
        if (!secondToken || secondToken.kind !== 'reference') return '#REF!';
        const second = parseAddress(secondToken.value);
        if (!second || second.row > 100 || second.col > 100) return '#REF!';
        const startRow = Math.min(first.row, second.row);
        const endRow = Math.min(100, Math.max(first.row, second.row));
        const startCol = Math.min(first.col, second.col);
        const endCol = Math.min(100, Math.max(first.col, second.col));
        const values: FormulaValue[] = [];
        for (let rangeRow = startRow; rangeRow <= endRow; rangeRow += 1) {
          for (let rangeCol = startCol; rangeCol <= endCol; rangeCol += 1) {
            values.push(cellValue(cellAddress(rangeRow, rangeCol)));
          }
        }
        return values;
      }
      return cellValue(token.value);
    }
    if (token.kind === 'identifier') {
      if (!consume('(')) return '#NAME?';
      const args: FormulaValue[] = [];
      if (peek()?.value !== ')') {
        do {
          args.push(readExpression());
        } while (consume(','));
      }
      if (!consume(')')) return '#VALUE!';
      const values = flatten(args);
      if (values.some((value) => typeof value === 'string' && value.startsWith('#'))) {
        return values.find((value) => typeof value === 'string' && value.startsWith('#')) as string;
      }
      const numbers = values.map(numeric).filter((value): value is number => value !== null);
      switch (token.value) {
        case 'SUM': return numbers.reduce((total, value) => total + value, 0);
        case 'AVERAGE': return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : '#DIV/0!';
        case 'MIN': return numbers.length ? Math.min(...numbers) : 0;
        case 'MAX': return numbers.length ? Math.max(...numbers) : 0;
        case 'COUNT': return numbers.length;
        case 'COUNTA': return values.filter((value) => value !== '').length;
        default: return '#NAME?';
      }
    }
    return '#VALUE!';
  };
  const readPower = (): FormulaValue => {
    let value = readPrimary();
    while (peek()?.value === '^') {
      consume('^');
      const right = readPrimary();
      const leftNumber = numeric(value);
      const rightNumber = numeric(right);
      value = leftNumber === null || rightNumber === null ? '#VALUE!' : leftNumber ** rightNumber;
    }
    return value;
  };
  const readUnary = (): FormulaValue => readPower();
  const readProduct = (): FormulaValue => {
    let value = readUnary();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const operator = consume()?.value;
      const right = readUnary();
      const leftNumber = numeric(value);
      const rightNumber = numeric(right);
      value = leftNumber === null || rightNumber === null
        ? '#VALUE!'
        : operator === '/' && rightNumber === 0
          ? '#DIV/0!'
          : operator === '*' ? leftNumber * rightNumber : leftNumber / rightNumber;
    }
    return value;
  };
  const readExpression = (): FormulaValue => {
    let value = readProduct();
    while (['+', '-', '&'].includes(peek()?.value ?? '')) {
      const operator = consume()?.value;
      const right = readProduct();
      if (operator === '&') {
        value = Array.isArray(value) || Array.isArray(right) ? '#VALUE!' : `${value}${right}`;
        continue;
      }
      const leftNumber = numeric(value);
      const rightNumber = numeric(right);
      value = leftNumber === null || rightNumber === null
        ? '#VALUE!'
        : operator === '+' ? leftNumber + rightNumber : leftNumber - rightNumber;
    }
    return value;
  };
  const result = readExpression();
  return offset === tokens.length ? result : '#VALUE!';
}

export function displayFormulaValue(value: FormulaValue): string {
  if (Array.isArray(value)) return '#VALUE!';
  return typeof value === 'number' ? String(Number(value.toPrecision(12))) : value;
}
