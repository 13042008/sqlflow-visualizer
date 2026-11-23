import type { ColumnMeta, SqlValue } from '../types/sql';
import type { Expr } from './ast';
import type { SqliteEngine } from './sqliteEngine';

export const AGGREGATE_FUNCTIONS = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'TOTAL',
  'GROUP_CONCAT',
]);

export interface EvalContext {
  columns: ColumnMeta[];
  rowCells: Record<string, SqlValue>;
  groupRows?: Array<Record<string, SqlValue>>;
  selectAliases?: Record<string, SqlValue>;
  engine: SqliteEngine;
  subqueryCache: Map<string, { columns: string[]; rows: SqlValue[][] }>;
}

export function containsAggregate(expr: Expr): boolean {
  switch (expr.kind) {
    case 'function':
      if (AGGREGATE_FUNCTIONS.has(expr.name.toUpperCase())) return true;
      return expr.args.some(containsAggregate);
    case 'binary':
      return containsAggregate(expr.left) || containsAggregate(expr.right);
    case 'unary':
      return containsAggregate(expr.operand);
    case 'is_null':
      return containsAggregate(expr.expr);
    case 'between':
      return (
        containsAggregate(expr.expr) ||
        containsAggregate(expr.low) ||
        containsAggregate(expr.high)
      );
    case 'in_list':
      return containsAggregate(expr.expr) || expr.values.some(containsAggregate);
    case 'in_subquery':
      return containsAggregate(expr.expr);
    case 'cast':
      return containsAggregate(expr.expr);
    case 'case':
      return (
        (expr.base ? containsAggregate(expr.base) : false) ||
        expr.whens.some((w) => containsAggregate(w.cond) || containsAggregate(w.result)) ||
        (expr.elseExpr ? containsAggregate(expr.elseExpr) : false)
      );
    default:
      return false;
  }
}

export function exprToReadableSql(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      if (expr.value === null) return 'NULL';
      if (typeof expr.value === 'string') return `'${expr.value}'`;
      return String(expr.value);
    case 'column':
      return expr.table ? `${expr.table}.${expr.name}` : expr.name;
    case 'star':
      return expr.table ? `${expr.table}.*` : '*';
    case 'unary':
      return expr.op === 'NOT'
        ? `NOT ${exprToReadableSql(expr.operand)}`
        : `${expr.op}${exprToReadableSql(expr.operand)}`;
    case 'binary':
      return `${exprToReadableSql(expr.left)} ${expr.op} ${exprToReadableSql(expr.right)}`;
    case 'function': {
      const dist = expr.distinct ? 'DISTINCT ' : '';
      return `${expr.name}(${dist}${expr.args.map(exprToReadableSql).join(', ')})`;
    }
    case 'is_null':
      return `${exprToReadableSql(expr.expr)} IS ${expr.negated ? 'NOT ' : ''}NULL`;
    case 'between':
      return `${exprToReadableSql(expr.expr)} ${expr.negated ? 'NOT ' : ''}BETWEEN ${exprToReadableSql(expr.low)} AND ${exprToReadableSql(expr.high)}`;
    case 'in_list':
      return `${exprToReadableSql(expr.expr)} ${expr.negated ? 'NOT ' : ''}IN (${expr.values.map(exprToReadableSql).join(', ')})`;
    case 'in_subquery':
      return `${exprToReadableSql(expr.expr)} ${expr.negated ? 'NOT ' : ''}IN (SELECT ...)`;
    case 'exists':
      return `${expr.negated ? 'NOT ' : ''}EXISTS (SELECT ...)`;
    case 'scalar_subquery':
      return `(SELECT ...)`;
    case 'cast':
      return `CAST(${exprToReadableSql(expr.expr)} AS ${expr.targetType})`;
    case 'case': {
      const parts = expr.whens.map(
        (w) => `WHEN ${exprToReadableSql(w.cond)} THEN ${exprToReadableSql(w.result)}`
      );
      return `CASE ${expr.base ? exprToReadableSql(expr.base) + ' ' : ''}${parts.join(' ')}${expr.elseExpr ? ` ELSE ${exprToReadableSql(expr.elseExpr)}` : ''} END`;
    }
  }
}

export function formatSqlValueInline(v: SqlValue): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'string') return `'${v}'`;
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  }
  return '[BLOB]';
}

export function resolveColumnId(
  columns: ColumnMeta[],
  table: string | undefined,
  name: string
): string | null {
  const lowerName = name.toLowerCase();
  if (table) {
    const lowerTable = table.toLowerCase();
    const match = columns.find(
      (c) =>
        c.name.toLowerCase() === lowerName &&
        (c.tableAlias?.toLowerCase() === lowerTable ||
          c.tableName?.toLowerCase() === lowerTable)
    );
    if (match) return match.id;
  } else {
    // Prefer exact name match
    const match = columns.find((c) => c.name.toLowerCase() === lowerName);
    if (match) return match.id;
    // Try qualifiedName match
    const qMatch = columns.find((c) => c.qualifiedName.toLowerCase() === lowerName);
    if (qMatch) return qMatch.id;
  }
  return null;
}

export function toBoolean(val: SqlValue): boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!Number.isNaN(num) && val.trim() !== '') return num !== 0;
    return false;
  }
  return Boolean(val);
}

export function isTruthy(val: SqlValue): boolean {
  return toBoolean(val) === true;
}

export function compareSqlValues(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'string') {
    const nb = Number(b);
    if (!Number.isNaN(nb) && b.trim() !== '') {
      return a < nb ? -1 : a > nb ? 1 : 0;
    }
    return -1; // SQLite: numbers sort before text
  }
  if (typeof a === 'string' && typeof b === 'number') {
    const na = Number(a);
    if (!Number.isNaN(na) && a.trim() !== '') {
      return na < b ? -1 : na > b ? 1 : 0;
    }
    return 1;
  }
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sqlLikeMatch(value: string, pattern: string): boolean {
  // SQLite LIKE is case-insensitive for ASCII; we do lowercase match for Vietnamese friendliness
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  const re = new RegExp(`^${escaped}$`, 'is');
  return re.test(value);
}

function runCachedSubquery(
  ctx: EvalContext,
  subquerySql: string
): { columns: string[]; rows: SqlValue[][] } {
  const cached = ctx.subqueryCache.get(subquerySql);
  if (cached) return cached;
  const result = ctx.engine.execQuery(subquerySql);
  ctx.subqueryCache.set(subquerySql, result);
  return result;
}

function evalAggregate(
  fnName: string,
  distinct: boolean,
  args: Expr[],
  ctx: EvalContext
): SqlValue {
  const rows = ctx.groupRows ?? [ctx.rowCells];
  const upper = fnName.toUpperCase();

  if (upper === 'COUNT') {
    if (args.length === 0 || args[0].kind === 'star') {
      return rows.length;
    }
    const vals: SqlValue[] = [];
    for (const r of rows) {
      const v = evalExpr(args[0], { ...ctx, rowCells: r, groupRows: undefined });
      if (v !== null && v !== undefined) vals.push(v);
    }
    if (distinct) {
      return new Set(vals.map((v) => `${typeof v}:${String(v)}`)).size;
    }
    return vals.length;
  }

  let vals: SqlValue[] = [];
  for (const r of rows) {
    const v = evalExpr(args[0], { ...ctx, rowCells: r, groupRows: undefined });
    if (v !== null && v !== undefined) vals.push(v);
  }

  if (distinct) {
    const seen = new Set<string>();
    vals = vals.filter((v) => {
      const k = `${typeof v}:${String(v)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (upper === 'SUM' || upper === 'TOTAL') {
    if (vals.length === 0) return upper === 'TOTAL' ? 0 : null;
    return vals.reduce<number>((acc, v) => acc + Number(v), 0);
  }

  if (upper === 'AVG') {
    if (vals.length === 0) return null;
    const sum = vals.reduce<number>((acc, v) => acc + Number(v), 0);
    return sum / vals.length;
  }

  if (upper === 'MIN') {
    if (vals.length === 0) return null;
    return vals.reduce((best, v) => (compareSqlValues(v, best) < 0 ? v : best));
  }

  if (upper === 'MAX') {
    if (vals.length === 0) return null;
    return vals.reduce((best, v) => (compareSqlValues(v, best) > 0 ? v : best));
  }

  if (upper === 'GROUP_CONCAT') {
    if (vals.length === 0) return null;
    const sep =
      args.length >= 2
        ? String(evalExpr(args[1], ctx) ?? ',')
        : ',';
    return vals.map((v) => String(v)).join(sep);
  }

  return null;
}

function evalScalarFunction(fnName: string, args: SqlValue[]): SqlValue {
  const upper = fnName.toUpperCase();
  switch (upper) {
    case 'ROUND': {
      if (args[0] === null || args[0] === undefined) return null;
      const num = Number(args[0]);
      const digits = args.length >= 2 && args[1] !== null ? Number(args[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round((num + Number.EPSILON) * factor) / factor;
    }
    case 'ABS':
      return args[0] === null ? null : Math.abs(Number(args[0]));
    case 'UPPER':
      return args[0] === null ? null : String(args[0]).toUpperCase();
    case 'LOWER':
      return args[0] === null ? null : String(args[0]).toLowerCase();
    case 'LENGTH':
      return args[0] === null ? null : String(args[0]).length;
    case 'COALESCE':
      for (const a of args) {
        if (a !== null && a !== undefined) return a;
      }
      return null;
    case 'IFNULL':
      return args[0] !== null && args[0] !== undefined ? args[0] : (args[1] ?? null);
    case 'NULLIF':
      return compareSqlValues(args[0] ?? null, args[1] ?? null) === 0
        ? null
        : (args[0] ?? null);
    case 'SUBSTR':
    case 'SUBSTRING': {
      if (args[0] === null) return null;
      const str = String(args[0]);
      const start = Number(args[1] ?? 1);
      const startIdx = start > 0 ? start - 1 : Math.max(0, str.length + start);
      if (args.length >= 3 && args[2] !== null) {
        return str.slice(startIdx, startIdx + Number(args[2]));
      }
      return str.slice(startIdx);
    }
    case 'TRIM':
      return args[0] === null ? null : String(args[0]).trim();
    case 'LTRIM':
      return args[0] === null ? null : String(args[0]).trimStart();
    case 'RTRIM':
      return args[0] === null ? null : String(args[0]).trimEnd();
    case 'REPLACE':
      if (args[0] === null || args[1] === null || args[2] === null) return null;
      return String(args[0]).split(String(args[1])).join(String(args[2]));
    case 'CONCAT':
      return args.map((a) => (a === null ? '' : String(a))).join('');
    case 'INSTR':
      if (args[0] === null || args[1] === null) return null;
      return String(args[0]).indexOf(String(args[1])) + 1;
    case 'IIF':
      return isTruthy(args[0] ?? null) ? (args[1] ?? null) : (args[2] ?? null);
    default:
      throw new Error(`Hàm "${fnName}" chưa được hỗ trợ trong bộ mô phỏng biểu thức.`);
  }
}

export function evalExpr(expr: Expr, ctx: EvalContext): SqlValue {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'boolean') return expr.value ? 1 : 0;
      return expr.value;

    case 'star':
      return null;

    case 'column': {
      // 1. Check select aliases if not table-qualified (useful for ORDER BY alias)
      if (!expr.table && ctx.selectAliases) {
        const lower = expr.name.toLowerCase();
        for (const [k, v] of Object.entries(ctx.selectAliases)) {
          if (k.toLowerCase() === lower) return v;
        }
      }
      const colId = resolveColumnId(ctx.columns, expr.table, expr.name);
      if (colId !== null && colId in ctx.rowCells) {
        return ctx.rowCells[colId];
      }
      // Fallback: check selectAliases again
      if (ctx.selectAliases && expr.name in ctx.selectAliases) {
        return ctx.selectAliases[expr.name];
      }
      return null;
    }

    case 'unary': {
      const val = evalExpr(expr.operand, ctx);
      if (expr.op === 'NOT') {
        const b = toBoolean(val);
        if (b === null) return null;
        return b ? 0 : 1;
      }
      if (val === null) return null;
      return expr.op === '-' ? -Number(val) : +Number(val);
    }

    case 'binary': {
      const op = expr.op.toUpperCase();
      if (op === 'AND') {
        const l = toBoolean(evalExpr(expr.left, ctx));
        const r = toBoolean(evalExpr(expr.right, ctx));
        if (l === false || r === false) return 0;
        if (l === true && r === true) return 1;
        return null;
      }
      if (op === 'OR') {
        const l = toBoolean(evalExpr(expr.left, ctx));
        const r = toBoolean(evalExpr(expr.right, ctx));
        if (l === true || r === true) return 1;
        if (l === false && r === false) return 0;
        return null;
      }

      const lv = evalExpr(expr.left, ctx);
      const rv = evalExpr(expr.right, ctx);

      if (op === 'IS' || op === 'IS NOT') {
        const same = compareSqlValues(lv, rv) === 0;
        return (op === 'IS' ? same : !same) ? 1 : 0;
      }

      if (lv === null || rv === null) return null;

      if (op === '||') return String(lv) + String(rv);
      if (op === '+') return Number(lv) + Number(rv);
      if (op === '-') return Number(lv) - Number(rv);
      if (op === '*') return Number(lv) * Number(rv);
      if (op === '/') {
        const denom = Number(rv);
        return denom === 0 ? null : Number(lv) / denom;
      }
      if (op === '%') {
        const denom = Number(rv);
        return denom === 0 ? null : Number(lv) % denom;
      }

      if (op === 'LIKE' || op === 'NOT LIKE') {
        const matched = sqlLikeMatch(String(lv), String(rv));
        return (op === 'LIKE' ? matched : !matched) ? 1 : 0;
      }

      const cmp = compareSqlValues(lv, rv);
      if (op === '=') return cmp === 0 ? 1 : 0;
      if (op === '!=' || op === '<>') return cmp !== 0 ? 1 : 0;
      if (op === '<') return cmp < 0 ? 1 : 0;
      if (op === '<=') return cmp <= 0 ? 1 : 0;
      if (op === '>') return cmp > 0 ? 1 : 0;
      if (op === '>=') return cmp >= 0 ? 1 : 0;
      return null;
    }

    case 'is_null': {
      const val = evalExpr(expr.expr, ctx);
      const isNull = val === null || val === undefined;
      return (expr.negated ? !isNull : isNull) ? 1 : 0;
    }

    case 'between': {
      const v = evalExpr(expr.expr, ctx);
      const lo = evalExpr(expr.low, ctx);
      const hi = evalExpr(expr.high, ctx);
      if (v === null || lo === null || hi === null) return null;
      const inRange = compareSqlValues(v, lo) >= 0 && compareSqlValues(v, hi) <= 0;
      return (expr.negated ? !inRange : inRange) ? 1 : 0;
    }

    case 'in_list': {
      const v = evalExpr(expr.expr, ctx);
      if (v === null) return null;
      let hasNull = false;
      for (const item of expr.values) {
        const iv = evalExpr(item, ctx);
        if (iv === null) {
          hasNull = true;
        } else if (compareSqlValues(v, iv) === 0) {
          return expr.negated ? 0 : 1;
        }
      }
      if (hasNull) return null;
      return expr.negated ? 1 : 0;
    }

    case 'in_subquery': {
      const v = evalExpr(expr.expr, ctx);
      if (v === null) return null;
      const subRes = runCachedSubquery(ctx, expr.subquerySql);
      let hasNull = false;
      for (const row of subRes.rows) {
        const iv = row[0] ?? null;
        if (iv === null) hasNull = true;
        else if (compareSqlValues(v, iv) === 0) return expr.negated ? 0 : 1;
      }
      if (hasNull) return null;
      return expr.negated ? 1 : 0;
    }

    case 'exists': {
      const subRes = runCachedSubquery(ctx, expr.subquerySql);
      const exists = subRes.rows.length > 0;
      return (expr.negated ? !exists : exists) ? 1 : 0;
    }

    case 'scalar_subquery': {
      const subRes = runCachedSubquery(ctx, expr.subquerySql);
      if (!subRes.rows.length) return null;
      return subRes.rows[0][0] ?? null;
    }

    case 'function': {
      if (AGGREGATE_FUNCTIONS.has(expr.name.toUpperCase())) {
        return evalAggregate(expr.name, expr.distinct, expr.args, ctx);
      }
      const argVals = expr.args.map((a) => evalExpr(a, ctx));
      return evalScalarFunction(expr.name, argVals);
    }

    case 'cast': {
      const v = evalExpr(expr.expr, ctx);
      if (v === null) return null;
      const t = expr.targetType.toUpperCase();
      if (t.includes('INT')) return Math.trunc(Number(v));
      if (t.includes('REAL') || t.includes('FLOAT') || t.includes('NUM') || t.includes('DEC')) {
        return Number(v);
      }
      return String(v);
    }

    case 'case': {
      if (expr.base) {
        const baseVal = evalExpr(expr.base, ctx);
        for (const w of expr.whens) {
          const condVal = evalExpr(w.cond, ctx);
          if (baseVal !== null && condVal !== null && compareSqlValues(baseVal, condVal) === 0) {
            return evalExpr(w.result, ctx);
          }
        }
      } else {
        for (const w of expr.whens) {
          if (isTruthy(evalExpr(w.cond, ctx))) {
            return evalExpr(w.result, ctx);
          }
        }
      }
      return expr.elseExpr ? evalExpr(expr.elseExpr, ctx) : null;
    }
  }
}

export function substituteExprForDisplay(expr: Expr, ctx: EvalContext): string {
  switch (expr.kind) {
    case 'literal':
      return formatSqlValueInline(expr.value === true ? 1 : expr.value === false ? 0 : expr.value);
    case 'column': {
      const val = evalExpr(expr, ctx);
      const label = expr.table ? `${expr.table}.${expr.name}` : expr.name;
      return `${label}(${formatSqlValueInline(val)})`;
    }
    case 'function': {
      if (AGGREGATE_FUNCTIONS.has(expr.name.toUpperCase())) {
        const val = evalExpr(expr, ctx);
        return `${exprToReadableSql(expr)}=${formatSqlValueInline(val)}`;
      }
      const val = evalExpr(expr, ctx);
      return `${exprToReadableSql(expr)}(${formatSqlValueInline(val)})`;
    }
    case 'scalar_subquery': {
      const val = evalExpr(expr, ctx);
      return `(${formatSqlValueInline(val)})`;
    }
    case 'binary':
      return `${substituteExprForDisplay(expr.left, ctx)} ${expr.op} ${substituteExprForDisplay(expr.right, ctx)}`;
    case 'unary':
      return expr.op === 'NOT'
        ? `NOT (${substituteExprForDisplay(expr.operand, ctx)})`
        : `${expr.op}${substituteExprForDisplay(expr.operand, ctx)}`;
    case 'is_null':
      return `${substituteExprForDisplay(expr.expr, ctx)} IS ${expr.negated ? 'NOT ' : ''}NULL`;
    case 'between':
      return `${substituteExprForDisplay(expr.expr, ctx)} ${expr.negated ? 'NOT ' : ''}BETWEEN ${substituteExprForDisplay(expr.low, ctx)} AND ${substituteExprForDisplay(expr.high, ctx)}`;
    case 'in_list':
      return `${substituteExprForDisplay(expr.expr, ctx)} ${expr.negated ? 'NOT ' : ''}IN (${expr.values.map((v) => substituteExprForDisplay(v, ctx)).join(', ')})`;
    case 'in_subquery':
      return `${substituteExprForDisplay(expr.expr, ctx)} ${expr.negated ? 'NOT ' : ''}IN (truy vấn con)`;
    default:
      return exprToReadableSql(expr);
  }
}
