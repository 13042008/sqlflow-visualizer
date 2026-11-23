export type TokenType =
  | 'KEYWORD'
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'OP'
  | 'PUNCT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  upper: string;
  start: number;
  end: number;
  quoted?: boolean;
}

export const SQL_KEYWORDS = new Set<string>([
  'WITH',
  'RECURSIVE',
  'SELECT',
  'DISTINCT',
  'ALL',
  'FROM',
  'AS',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'NATURAL',
  'ON',
  'USING',
  'WHERE',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'LIMIT',
  'OFFSET',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'IN',
  'BETWEEN',
  'LIKE',
  'GLOB',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
  'OVER',
  'PARTITION',
]);

export function tokenizeSql(input: string): Token[] {
  const tokens: Token[] = [];
  const len = input.length;
  let i = 0;

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Single-line comment --
    if (ch === '-' && input[i + 1] === '-') {
      i += 2;
      while (i < len && input[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment /* ... */
    if (ch === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < len && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      const start = i;
      i++;
      let val = '';
      while (i < len) {
        if (input[i] === "'" && input[i + 1] === "'") {
          val += "'";
          i += 2;
        } else if (input[i] === "'") {
          i++;
          break;
        } else {
          val += input[i++];
        }
      }
      tokens.push({ type: 'STRING', value: val, upper: val.toUpperCase(), start, end: i });
      continue;
    }

    // Quoted identifier: "...", `...`, [...]
    if (ch === '"' || ch === '`' || ch === '[') {
      const start = i;
      const closeChar = ch === '[' ? ']' : ch;
      i++;
      let val = '';
      while (i < len) {
        if (input[i] === closeChar && closeChar !== ']' && input[i + 1] === closeChar) {
          val += closeChar;
          i += 2;
        } else if (input[i] === closeChar) {
          i++;
          break;
        } else {
          val += input[i++];
        }
      }
      tokens.push({
        type: 'IDENT',
        value: val,
        upper: val.toUpperCase(),
        start,
        end: i,
        quoted: true,
      });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      const start = i;
      while (i < len && /[0-9]/.test(input[i])) i++;
      if (i < len && input[i] === '.') {
        i++;
        while (i < len && /[0-9]/.test(input[i])) i++;
      }
      if (i < len && (input[i] === 'e' || input[i] === 'E')) {
        i++;
        if (i < len && (input[i] === '+' || input[i] === '-')) i++;
        while (i < len && /[0-9]/.test(input[i])) i++;
      }
      const raw = input.slice(start, i);
      tokens.push({ type: 'NUMBER', value: raw, upper: raw, start, end: i });
      continue;
    }

    // Identifiers and keywords (supports Unicode letters too)
    if (/[A-Za-z_\u00C0-\u1EF9]/.test(ch)) {
      const start = i;
      while (i < len && /[A-Za-z0-9_\u00C0-\u1EF9]/.test(input[i])) i++;
      const raw = input.slice(start, i);
      const upper = raw.toUpperCase();
      tokens.push({
        type: SQL_KEYWORDS.has(upper) ? 'KEYWORD' : 'IDENT',
        value: raw,
        upper,
        start,
        end: i,
      });
      continue;
    }

    // Two-character operators
    const two = input.slice(i, i + 2);
    if (two === '!=' || two === '<>' || two === '<=' || two === '>=' || two === '||' || two === '==') {
      tokens.push({ type: 'OP', value: two, upper: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }

    // Single-character operators
    if ('=<>+-*/%'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch, upper: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    // Punctuation
    if ('(),.;'.includes(ch)) {
      tokens.push({ type: 'PUNCT', value: ch, upper: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    throw new Error(`Ký tự không hợp lệ "${ch}" tại vị trí ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', upper: '', start: len, end: len });
  return tokens;
}
