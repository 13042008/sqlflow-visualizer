import type {
  ClauseType,
  ColumnMeta,
  DmlDiffResult,
  DmlDiffRow,
  ExecutionStep,
  GroupBucket,
  JoinPreviewData,
  SqlValue,
  TextSpan,
  TraceExecutionResult,
  TracedRow,
  WrittenClauseOrderItem,
} from '../types/sql';
import type { Expr, JoinClause, SelectCore, SelectStatement, TableSource } from './ast';
import {
  AGGREGATE_FUNCTIONS,
  compareSqlValues,
  containsAggregate,
  evalExpr,
  exprToReadableSql,
  formatSqlValueInline,
  isTruthy,
  resolveColumnId,
  substituteExprForDisplay,
  toBoolean,
  type EvalContext,
} from './evaluator';
import { tokenizeSql } from './lexer';
import { parseSelectSql } from './parser';
import { SqliteEngine, translateSqliteError } from './sqliteEngine';

interface InternalRow {
  id: string;
  cells: Record<string, SqlValue>;
  sourceRowIds: string[];
  joinSide?: 'matched' | 'left_only' | 'right_only';
  groupRows?: Array<Record<string, SqlValue>>;
  preSelectCells?: Record<string, SqlValue>;
  preSelectColumns?: ColumnMeta[];
  selectAliases?: Record<string, SqlValue>;
}

interface RawTableData {
  columns: string[];
  rows: SqlValue[][];
}

function sliceSql(sql: string, span?: TextSpan): string {
  if (!span) return '';
  return sql.slice(span.start, span.end).trim();
}

function collectAggregateExprs(expr: Expr, out: Map<string, Expr>): void {
  if (expr.kind === 'function' && AGGREGATE_FUNCTIONS.has(expr.name.toUpperCase())) {
    const key = exprToReadableSql(expr);
    if (!out.has(key)) out.set(key, expr);
    return;
  }
  switch (expr.kind) {
    case 'binary':
      collectAggregateExprs(expr.left, out);
      collectAggregateExprs(expr.right, out);
      break;
    case 'unary':
      collectAggregateExprs(expr.operand, out);
      break;
    case 'is_null':
    case 'cast':
      collectAggregateExprs(expr.expr, out);
      break;
    case 'between':
      collectAggregateExprs(expr.expr, out);
      collectAggregateExprs(expr.low, out);
      collectAggregateExprs(expr.high, out);
      break;
    case 'in_list':
      collectAggregateExprs(expr.expr, out);
      expr.values.forEach((v) => collectAggregateExprs(v, out));
      break;
    case 'in_subquery':
      collectAggregateExprs(expr.expr, out);
      break;
    case 'function':
      expr.args.forEach((a) => collectAggregateExprs(a, out));
      break;
    case 'case':
      if (expr.base) collectAggregateExprs(expr.base, out);
      expr.whens.forEach((w) => {
        collectAggregateExprs(w.cond, out);
        collectAggregateExprs(w.result, out);
      });
      if (expr.elseExpr) collectAggregateExprs(expr.elseExpr, out);
      break;
  }
}

function buildRowTupleKey(cols: ColumnMeta[], cells: Record<string, SqlValue>): string {
  return cols
    .map((c) => {
      const v = cells[c.id];
      if (v === null || v === undefined) return 'NULL';
      return `${typeof v}:${String(v)}`;
    })
    .join('\u001f');
}

function valuesRoughlyEqual(a: SqlValue, b: SqlValue): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-5;
  }
  return String(a) === String(b);
}

function verifyAgainstSqlite(
  steps: ExecutionStep[],
  sqliteResult: { columns: string[]; rows: SqlValue[][] },
  strictOrder: boolean
): boolean {
  if (!steps.length) return false;
  const lastStep = steps[steps.length - 1];
  const finalCols = lastStep.columns.filter((c) => c.isSelected !== false);
  const keptRows = lastStep.rows.filter(
    (r) => r.status === 'kept' || r.status === 'unmatched_null'
  );

  if (keptRows.length !== sqliteResult.rows.length) return false;
  if (finalCols.length !== sqliteResult.columns.length) return false;

  const tracedMatrix: SqlValue[][] = keptRows.map((row) =>
    finalCols.map((col) => row.cells[col.id] ?? null)
  );
  const sqliteMatrix: SqlValue[][] = sqliteResult.rows.map((row) =>
    finalCols.map((_, j) => row[j] ?? null)
  );

  if (strictOrder) {
    for (let i = 0; i < tracedMatrix.length; i++) {
      for (let j = 0; j < finalCols.length; j++) {
        if (!valuesRoughlyEqual(tracedMatrix[i][j], sqliteMatrix[i][j])) return false;
      }
    }
    return true;
  }

  // Without ORDER BY, SQL row order is unspecified (e.g. SQLite automatic covering index):
  // compare canonical sorted multisets.
  const sortRows = (matrix: SqlValue[][]) =>
    [...matrix].sort((a, b) => {
      for (let j = 0; j < a.length; j++) {
        const cmp = compareSqlValues(a[j], b[j]);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });

  const sortedTraced = sortRows(tracedMatrix);
  const sortedSqlite = sortRows(sqliteMatrix);

  for (let i = 0; i < sortedTraced.length; i++) {
    for (let j = 0; j < finalCols.length; j++) {
      if (!valuesRoughlyEqual(sortedTraced[i][j], sortedSqlite[i][j])) return false;
    }
  }
  return true;
}

function detectFirstKeyword(sql: string): string {
  try {
    const tokens = tokenizeSql(sql);
    const first = tokens.find((t) => t.type !== 'EOF');
    return first ? first.upper : '';
  } catch {
    const m = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .match(/^([A-Za-z]+)/);
    return m ? m[1].toUpperCase() : '';
  }
}

function extractDmlTargetTable(
  sql: string,
  stmtType: 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL'
): string | undefined {
  const cleaned = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();

  if (stmtType === 'INSERT') {
    const m = cleaned.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`\[]?([A-Za-z0-9_]+)["`\]]?/i);
    return m?.[1];
  }
  if (stmtType === 'UPDATE') {
    const m = cleaned.match(/UPDATE\s+(?:OR\s+\w+\s+)?["`\[]?([A-Za-z0-9_]+)["`\]]?/i);
    return m?.[1];
  }
  if (stmtType === 'DELETE') {
    const m = cleaned.match(/DELETE\s+FROM\s+["`\[]?([A-Za-z0-9_]+)["`\]]?/i);
    return m?.[1];
  }
  return undefined;
}

function buildDmlDiff(
  stmtType: 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL',
  tableName: string | undefined,
  beforeData: RawTableData | null,
  afterData: RawTableData | null
): DmlDiffResult {
  if (!tableName || !afterData) {
    return {
      statementType: stmtType,
      tableName,
      message: `Đã thực thi câu lệnh ${stmtType} thành công trên cơ sở dữ liệu SQLite.`,
      columns: [],
      diffRows: [],
      addedCount: 0,
      updatedCount: 0,
      deletedCount: 0,
    };
  }

  const cols = afterData.columns;
  const toRecord = (row: SqlValue[]): Record<string, SqlValue> => {
    const rec: Record<string, SqlValue> = {};
    cols.forEach((c, idx) => {
      rec[c] = row[idx] ?? null;
    });
    return rec;
  };

  const beforeRecs = (beforeData?.rows ?? []).map(toRecord);
  const afterRecs = afterData.rows.map(toRecord);
  const pkCol = cols[0];

  const diffRows: DmlDiffRow[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  if (pkCol) {
    const beforeMap = new Map<string, Record<string, SqlValue>>();
    beforeRecs.forEach((r, idx) => beforeMap.set(`${r[pkCol] ?? idx}`, r));
    const afterMap = new Map<string, Record<string, SqlValue>>();
    afterRecs.forEach((r, idx) => afterMap.set(`${r[pkCol] ?? idx}`, r));

    for (const [k, bRec] of beforeMap.entries()) {
      const aRec = afterMap.get(k);
      if (!aRec) {
        deletedCount++;
        diffRows.push({ status: 'removed', before: bRec });
      } else {
        const changed = cols.filter((c) => !valuesRoughlyEqual(bRec[c], aRec[c]));
        if (changed.length > 0) {
          updatedCount++;
          diffRows.push({ status: 'updated', before: bRec, after: aRec, changedColumns: changed });
        } else {
          diffRows.push({ status: 'unchanged', before: bRec, after: aRec });
        }
      }
    }

    for (const [k, aRec] of afterMap.entries()) {
      if (!beforeMap.has(k)) {
        addedCount++;
        diffRows.push({ status: 'added', after: aRec });
      }
    }
  }

  const summaryParts: string[] = [];
  if (addedCount > 0) summaryParts.push(`thêm ${addedCount} dòng`);
  if (updatedCount > 0) summaryParts.push(`cập nhật ${updatedCount} dòng`);
  if (deletedCount > 0) summaryParts.push(`xóa ${deletedCount} dòng`);

  return {
    statementType: stmtType,
    tableName,
    message:
      summaryParts.length > 0
        ? `Bảng "${tableName}" đã thay đổi: ${summaryParts.join(', ')}.`
        : `Đã thực thi ${stmtType} trên bảng "${tableName}" (không có dòng nào thay đổi).`,
    columns: cols,
    diffRows,
    addedCount,
    updatedCount,
    deletedCount,
  };
}

function loadTableSource(
  source: TableSource,
  engine: SqliteEngine,
  cteTables: Map<string, RawTableData>
): { data: RawTableData; label: string; alias: string; tableName: string } {
  if (source.kind === 'subquery' && source.subquerySql) {
    const res = engine.execQuery(source.subquerySql);
    const alias = source.alias || 'subquery';
    return {
      data: res,
      label: `(${alias})`,
      alias,
      tableName: alias,
    };
  }

  const rawName = source.tableName ?? '';
  const cte = cteTables.get(rawName.toLowerCase());
  const data = cte ?? engine.getTableData(rawName);
  const alias = source.alias || rawName;
  const label = source.alias && source.alias !== rawName ? `${rawName} AS ${source.alias}` : rawName;
  return { data, label, alias, tableName: rawName };
}

function makeColumnsForSource(
  rawCols: string[],
  tableName: string,
  tableAlias: string,
  sourceIndex: number
): ColumnMeta[] {
  return rawCols.map((col) => ({
    id: `${tableAlias}.${col}#${sourceIndex}`,
    name: col,
    qualifiedName: `${tableAlias}.${col}`,
    tableAlias,
    tableName,
    sourceIndex,
  }));
}

function makeRowsForSource(
  rawRows: SqlValue[][],
  cols: ColumnMeta[],
  prefix: string
): InternalRow[] {
  return rawRows.map((rowVals, idx) => {
    const cells: Record<string, SqlValue> = {};
    cols.forEach((c, cIdx) => {
      cells[c.id] = rowVals[cIdx] ?? null;
    });
    const rowId = `${prefix}-${idx + 1}`;
    return {
      id: rowId,
      cells,
      sourceRowIds: [rowId],
    };
  });
}

function traceSelectCore(
  core: SelectCore,
  sql: string,
  engine: SqliteEngine,
  cteTables: Map<string, RawTableData>,
  subqueryCache: Map<string, RawTableData>,
  orderByExprs: Expr[],
  steps: ExecutionStep[],
  writtenItems: Array<{ clause: ClauseType; label: string; span: TextSpan; stepIndex: number }>
): { columns: ColumnMeta[]; rows: InternalRow[] } {
  let currentCols: ColumnMeta[] = [];
  let currentRows: InternalRow[] = [];
  let sourceIndexCounter = 0;

  // 1. FROM
  if (core.from && core.fromSpan) {
    const loaded = loadTableSource(core.from, engine, cteTables);
    currentCols = makeColumnsForSource(
      loaded.data.columns,
      loaded.tableName,
      loaded.alias,
      sourceIndexCounter++
    );
    currentRows = makeRowsForSource(loaded.data.rows, currentCols, loaded.alias);

    const stepIdx = steps.length;
    steps.push({
      index: stepIdx,
      clause: 'FROM',
      badgeLabel: 'FROM',
      title: `Tải dữ liệu nguồn từ bảng "${loaded.tableName}"`,
      sqlSnippet: sliceSql(sql, core.fromSpan),
      span: core.fromSpan,
      explanation: `Bước đầu tiên luôn là đọc toàn bộ ${currentRows.length} dòng và ${currentCols.length} cột từ bảng "${loaded.tableName}"${
        core.from.alias ? ` (đặt bí danh là "${core.from.alias}")` : ''
      }.`,
      tip: 'Dù SELECT được viết ở dòng đầu tiên, SQL luôn bắt đầu thực thi từ mệnh đề FROM để xác định dữ liệu đầu vào.',
      inputCount: currentRows.length,
      outputCount: currentRows.length,
      unit: 'dòng',
      columns: currentCols.map((c) => ({ ...c })),
      rows: currentRows.map((r) => ({
        id: r.id,
        cells: { ...r.cells },
        status: 'kept',
        sourceRowIds: [...r.sourceRowIds],
      })),
    });

    writtenItems.push({
      clause: 'FROM',
      label: `FROM ${loaded.label}`,
      span: core.fromSpan,
      stepIndex: stepIdx,
    });
  } else {
    // SELECT without FROM (e.g. SELECT 1 + 1 AS total)
    currentRows = [{ id: 'const-1', cells: {}, sourceRowIds: ['const-1'] }];
  }

  // 2. JOINs
  for (const join of core.joins) {
    const prevCount = currentRows.length;
    const prevLabel =
      steps.length > 0 && steps[steps.length - 1].clause === 'FROM'
        ? currentCols[0]?.tableAlias || 'Bảng trái'
        : 'Tập kết quả trước';

    const loadedRight = loadTableSource(join.table, engine, cteTables);
    const rightCols = makeColumnsForSource(
      loadedRight.data.columns,
      loadedRight.tableName,
      loadedRight.alias,
      sourceIndexCounter++
    );
    const rightRows = makeRowsForSource(loadedRight.data.rows, rightCols, loadedRight.alias);

    const combinedCols = [...currentCols, ...rightCols];
    const leftColsSnapshot = currentCols.map((c) => ({ ...c }));

    const leftMatchCounts = new Array<number>(currentRows.length).fill(0);
    const rightMatchCounts = new Array<number>(rightRows.length).fill(0);

    // Resolve NATURAL / USING columns if present
    let usingCols = join.using ?? [];
    if (join.natural) {
      const leftNames = new Set(currentCols.map((c) => c.name.toLowerCase()));
      usingCols = rightCols
        .filter((rc) => leftNames.has(rc.name.toLowerCase()))
        .map((rc) => rc.name);
    }

    const joinedRows: InternalRow[] = [];
    const tracedJoinedRows: TracedRow[] = [];
    let matchedPairsCount = 0;

    for (let li = 0; li < currentRows.length; li++) {
      const lRow = currentRows[li];
      for (let ri = 0; ri < rightRows.length; ri++) {
        const rRow = rightRows[ri];
        const mergedCells: Record<string, SqlValue> = { ...lRow.cells, ...rRow.cells };

        let matches = true;
        if (join.joinType === 'CROSS') {
          matches = true;
        } else if (join.on) {
          const val = evalExpr(join.on, {
            columns: combinedCols,
            rowCells: mergedCells,
            engine,
            subqueryCache,
          });
          matches = isTruthy(val);
        } else if (usingCols.length > 0) {
          matches = usingCols.every((colName) => {
            const lColId = resolveColumnId(currentCols, undefined, colName);
            const rColId = resolveColumnId(rightCols, undefined, colName);
            if (!lColId || !rColId) return false;
            const lv = lRow.cells[lColId];
            const rv = rRow.cells[rColId];
            return lv !== null && rv !== null && compareSqlValues(lv, rv) === 0;
          });
        }

        if (matches) {
          leftMatchCounts[li]++;
          rightMatchCounts[ri]++;
          matchedPairsCount++;
          const newId = `${lRow.id}__${rRow.id}`;
          const internal: InternalRow = {
            id: newId,
            cells: mergedCells,
            sourceRowIds: [...lRow.sourceRowIds, ...rRow.sourceRowIds],
            joinSide: 'matched',
          };
          joinedRows.push(internal);
          tracedJoinedRows.push({
            id: newId,
            cells: { ...mergedCells },
            status: 'kept',
            sourceRowIds: internal.sourceRowIds,
            joinSide: 'matched',
          });
        }
      }

      // LEFT / FULL OUTER unmatched left row
      if (leftMatchCounts[li] === 0 && (join.joinType === 'LEFT' || join.joinType === 'FULL')) {
        const nullRightCells: Record<string, SqlValue> = {};
        rightCols.forEach((rc) => {
          nullRightCells[rc.id] = null;
        });
        const mergedCells = { ...lRow.cells, ...nullRightCells };
        const newId = `${lRow.id}__null`;
        const internal: InternalRow = {
          id: newId,
          cells: mergedCells,
          sourceRowIds: [...lRow.sourceRowIds],
          joinSide: 'left_only',
        };
        joinedRows.push(internal);
        tracedJoinedRows.push({
          id: newId,
          cells: { ...mergedCells },
          status: 'unmatched_null',
          sourceRowIds: internal.sourceRowIds,
          joinSide: 'left_only',
        });
      }
    }

    // RIGHT / FULL OUTER unmatched right rows
    if (join.joinType === 'RIGHT' || join.joinType === 'FULL') {
      for (let ri = 0; ri < rightRows.length; ri++) {
        if (rightMatchCounts[ri] === 0) {
          const rRow = rightRows[ri];
          const nullLeftCells: Record<string, SqlValue> = {};
          currentCols.forEach((lc) => {
            nullLeftCells[lc.id] = null;
          });
          const mergedCells = { ...nullLeftCells, ...rRow.cells };
          const newId = `null__${rRow.id}`;
          const internal: InternalRow = {
            id: newId,
            cells: mergedCells,
            sourceRowIds: [...rRow.sourceRowIds],
            joinSide: 'right_only',
          };
          joinedRows.push(internal);
          tracedJoinedRows.push({
            id: newId,
            cells: { ...mergedCells },
            status: 'unmatched_null',
            sourceRowIds: internal.sourceRowIds,
            joinSide: 'right_only',
          });
        }
      }
    }

    const leftOnlyCount = leftMatchCounts.filter((c) => c === 0).length;
    const rightOnlyCount = rightMatchCounts.filter((c) => c === 0).length;

    const conditionText = join.on
      ? sliceSql(sql, join.on.span)
      : usingCols.length > 0
        ? `USING (${usingCols.join(', ')})`
        : 'Tích Đề-các (mọi cặp dòng)';

    const joinPreview: JoinPreviewData = {
      joinType: join.joinType,
      leftLabel: prevLabel,
      rightLabel: loadedRight.label,
      leftTableAlias: prevLabel,
      rightTableAlias: loadedRight.alias,
      leftColumns: leftColsSnapshot,
      rightColumns: rightCols.map((c) => ({ ...c })),
      leftRows: currentRows.map((r, idx) => ({
        id: r.id,
        cells: { ...r.cells },
        matchCount: leftMatchCounts[idx],
      })),
      rightRows: rightRows.map((r, idx) => ({
        id: r.id,
        cells: { ...r.cells },
        matchCount: rightMatchCounts[idx],
      })),
      conditionText,
      matchedPairsCount,
      leftOnlyCount,
      rightOnlyCount,
    };

    const joinLabel = `${join.joinType} JOIN`;
    const explanation = buildJoinExplanation(
      join,
      prevLabel,
      prevCount,
      loadedRight.tableName,
      rightRows.length,
      conditionText,
      matchedPairsCount,
      leftOnlyCount,
      rightOnlyCount,
      joinedRows.length
    );

    const stepIdx = steps.length;
    steps.push({
      index: stepIdx,
      clause: 'JOIN',
      badgeLabel: joinLabel,
      title: `${joinLabel} với bảng "${loadedRight.tableName}"`,
      sqlSnippet: sliceSql(sql, join.span),
      span: join.span,
      explanation,
      tip:
        join.joinType === 'LEFT'
          ? 'Các dòng tô màu xanh nhạt chứa ô NULL là những bản ghi bên trái không tìm thấy bản ghi khớp bên phải.'
          : join.joinType === 'INNER'
            ? 'INNER JOIN chỉ giữ những cặp dòng thỏa điều kiện ON — các dòng không khớp ở hai bên đều bị loại.'
            : undefined,
      inputCount: prevCount,
      outputCount: joinedRows.length,
      unit: 'dòng',
      columns: combinedCols.map((c) => ({ ...c })),
      rows: tracedJoinedRows,
      joinPreview,
    });

    writtenItems.push({
      clause: 'JOIN',
      label: `${joinLabel} ${loadedRight.label}`,
      span: join.span,
      stepIndex: stepIdx,
    });

    currentCols = combinedCols;
    currentRows = joinedRows;
  }

  // 3. WHERE
  if (core.where && core.whereSpan) {
    const exprText = sliceSql(sql, core.where.span);
    const inputCount = currentRows.length;
    const keptRows: InternalRow[] = [];
    const tracedRows: TracedRow[] = [];

    for (const row of currentRows) {
      const ctx: EvalContext = {
        columns: currentCols,
        rowCells: row.cells,
        engine,
        subqueryCache,
      };
      const rawRes = evalExpr(core.where, ctx);
      const boolRes = toBoolean(rawRes);
      const passed = boolRes === true;
      const substituted = substituteExprForDisplay(core.where, ctx);

      if (passed) {
        keptRows.push(row);
      }

      tracedRows.push({
        id: row.id,
        cells: { ...row.cells },
        status: passed ? 'kept' : 'filtered',
        sourceRowIds: [...row.sourceRowIds],
        joinSide: row.joinSide,
        evaluation: {
          expression: exprText,
          substituted,
          result: boolRes,
        },
      });
    }

    const filteredOut = inputCount - keptRows.length;
    const stepIdx = steps.length;
    steps.push({
      index: stepIdx,
      clause: 'WHERE',
      badgeLabel: 'WHERE',
      title: `Lọc từng dòng theo điều kiện`,
      sqlSnippet: sliceSql(sql, core.whereSpan),
      span: core.whereSpan,
      explanation: `Kiểm tra điều kiện "${exprText}" trên từng dòng. Có ${keptRows.length}/${inputCount} dòng thỏa mãn (loại bỏ ${filteredOut} dòng).`,
      tip: 'Nhấp vào bất kỳ dòng nào để xem chi tiết giá trị thay thế khi đánh giá điều kiện WHERE.',
      inputCount,
      outputCount: keptRows.length,
      unit: 'dòng',
      columns: currentCols.map((c) => ({ ...c })),
      rows: tracedRows,
    });

    writtenItems.push({
      clause: 'WHERE',
      label: 'WHERE',
      span: core.whereSpan,
      stepIndex: stepIdx,
    });

    currentRows = keptRows;
  }

  // 4. GROUP BY (explicit or implicit via aggregate functions in SELECT/HAVING)
  const hasAggInSelect = core.selectItems.some((item) => containsAggregate(item.expr));
  const hasAggInHaving = core.having ? containsAggregate(core.having) : false;
  const isGrouped = core.groupBy.length > 0 || hasAggInSelect || hasAggInHaving;

  let activeGroups: GroupBucket[] = [];

  if (isGrouped) {
    const inputCount = currentRows.length;

    // Collect aggregates referenced across SELECT, HAVING, ORDER BY
    const aggMap = new Map<string, Expr>();
    core.selectItems.forEach((it) => collectAggregateExprs(it.expr, aggMap));
    if (core.having) collectAggregateExprs(core.having, aggMap);
    orderByExprs.forEach((oe) => collectAggregateExprs(oe, aggMap));

    const bucketMap = new Map<
      string,
      {
        keyValues: Record<string, SqlValue>;
        keyLabel: string;
        members: InternalRow[];
      }
    >();

    if (core.groupBy.length > 0) {
      for (const row of currentRows) {
        const ctx: EvalContext = {
          columns: currentCols,
          rowCells: row.cells,
          engine,
          subqueryCache,
        };
        const keyVals: SqlValue[] = [];
        const keyRecord: Record<string, SqlValue> = {};
        const keyParts: string[] = [];

        core.groupBy.forEach((gExpr, idx) => {
          const val = evalExpr(gExpr, ctx);
          const colLabel = exprToReadableSql(gExpr);
          keyVals.push(val);
          keyRecord[colLabel] = val;
          keyParts.push(
            core.groupBy.length === 1
              ? formatSqlValueInline(val).replace(/^'|'$/g, '')
              : `${colLabel} = ${formatSqlValueInline(val)}`
          );
          void idx;
        });

        const bucketKey = keyVals
          .map((v) => (v === null ? 'NULL' : `${typeof v}:${String(v)}`))
          .join('\u001f');

        let bucket = bucketMap.get(bucketKey);
        if (!bucket) {
          bucket = {
            keyValues: keyRecord,
            keyLabel: keyParts.join(' • '),
            members: [],
          };
          bucketMap.set(bucketKey, bucket);
        }
        bucket.members.push(row);
      }
    } else {
      // Implicit single group for queries like SELECT COUNT(*), AVG(gpa) FROM students
      bucketMap.set('__ALL__', {
        keyValues: { 'Toàn bộ bảng': `${currentRows.length} dòng` },
        keyLabel: 'Tất cả các dòng (1 nhóm duy nhất)',
        members: [...currentRows],
      });
    }

    let gIndex = 0;
    activeGroups = Array.from(bucketMap.values()).map((b) => {
      gIndex++;
      const groupRowsCells = b.members.map((m) => m.cells);
      const aggregates: Record<string, SqlValue> = {};
      for (const [aggLabel, aggExpr] of aggMap.entries()) {
        aggregates[aggLabel] = evalExpr(aggExpr, {
          columns: currentCols,
          rowCells: groupRowsCells[0] ?? {},
          groupRows: groupRowsCells,
          engine,
          subqueryCache,
        });
      }
      return {
        groupId: `group-${gIndex}`,
        keyValues: b.keyValues,
        keyLabel: b.keyLabel,
        memberRows: b.members.map((m) => ({
          id: m.id,
          cells: { ...m.cells },
          status: 'kept',
          groupId: `group-${gIndex}`,
        })),
        aggregates,
        status: 'kept',
      };
    });

    // Mark group key columns
    const groupKeyColIds = new Set<string>();
    for (const gExpr of core.groupBy) {
      if (gExpr.kind === 'column') {
        const cid = resolveColumnId(currentCols, gExpr.table, gExpr.name);
        if (cid) groupKeyColIds.add(cid);
      }
    }

    const groupStepCols = currentCols.map((c) => ({
      ...c,
      isGroupKey: groupKeyColIds.has(c.id),
    }));

    const stepIdx = steps.length;
    const isExplicitGroupBy = core.groupBy.length > 0 && Boolean(core.groupBySpan);
    const groupByText = isExplicitGroupBy
      ? core.groupBy.map((e) => sliceSql(sql, e.span)).join(', ')
      : 'Hàm tổng hợp toàn bảng';

    steps.push({
      index: stepIdx,
      clause: 'GROUP_BY',
      badgeLabel: isExplicitGroupBy ? 'GROUP BY' : 'GOM NHÓM',
      title: isExplicitGroupBy
        ? `Gom nhóm theo ${groupByText}`
        : 'Gom toàn bộ dòng thành 1 nhóm để tính tổng hợp',
      sqlSnippet: isExplicitGroupBy
        ? sliceSql(sql, core.groupBySpan)
        : '(Gom nhóm ngầm định do dùng hàm tổng hợp)',
      span: core.groupBySpan,
      explanation: isExplicitGroupBy
        ? `Phân loại ${inputCount} dòng thành ${activeGroups.length} nhóm có cùng giá trị ${groupByText}. Mỗi nhóm sẽ cho ra đúng 1 dòng kết quả sau khi tính các hàm tổng hợp.`
        : `Truy vấn sử dụng hàm tổng hợp (${Array.from(aggMap.keys()).join(', ')}) mà không có GROUP BY, nên toàn bộ ${inputCount} dòng được gom thành 1 nhóm duy nhất.`,
      tip: 'Bạn có thể mở rộng từng nhóm để xem các dòng thành phần và cách hàm tổng hợp (COUNT, SUM, AVG...) tính ra kết quả.',
      inputCount,
      outputCount: activeGroups.length,
      unit: 'nhóm',
      columns: groupStepCols,
      rows: activeGroups.flatMap((g) => g.memberRows),
      groups: activeGroups.map((g) => ({ ...g })),
    });

    if (isExplicitGroupBy && core.groupBySpan) {
      writtenItems.push({
        clause: 'GROUP_BY',
        label: 'GROUP BY',
        span: core.groupBySpan,
        stepIndex: stepIdx,
      });
    }

    // 5. HAVING
    if (core.having && core.havingSpan) {
      const havingText = sliceSql(sql, core.having.span);
      const inputGroupCount = activeGroups.length;
      const evaluatedGroups: GroupBucket[] = [];
      const keptGroups: GroupBucket[] = [];

      for (const group of activeGroups) {
        const groupRowsCells = group.memberRows.map((r) => r.cells);
        const ctx: EvalContext = {
          columns: currentCols,
          rowCells: groupRowsCells[0] ?? {},
          groupRows: groupRowsCells,
          engine,
          subqueryCache,
        };
        const rawRes = evalExpr(core.having, ctx);
        const boolRes = toBoolean(rawRes);
        const passed = boolRes === true;
        const substituted = substituteExprForDisplay(core.having, ctx);

        const nextGroup: GroupBucket = {
          ...group,
          status: passed ? 'kept' : 'filtered',
          evaluation: {
            expression: havingText,
            substituted,
            result: boolRes,
          },
        };
        evaluatedGroups.push(nextGroup);
        if (passed) keptGroups.push(nextGroup);
      }

      const stepIdxH = steps.length;
      steps.push({
        index: stepIdxH,
        clause: 'HAVING',
        badgeLabel: 'HAVING',
        title: 'Lọc nhóm theo điều kiện tổng hợp',
        sqlSnippet: sliceSql(sql, core.havingSpan),
        span: core.havingSpan,
        explanation: `Kiểm tra điều kiện "${havingText}" trên từng nhóm. Giữ lại ${keptGroups.length}/${inputGroupCount} nhóm (loại bỏ ${
          inputGroupCount - keptGroups.length
        } nhóm).`,
        tip: 'Khác với WHERE (lọc từng dòng trước khi gom nhóm), HAVING lọc các nhóm sau khi đã tính toán hàm tổng hợp.',
        inputCount: inputGroupCount,
        outputCount: keptGroups.length,
        unit: 'nhóm',
        columns: groupStepCols,
        rows: evaluatedGroups.flatMap((g) =>
          g.memberRows.map((r) => ({ ...r, status: g.status }))
        ),
        groups: evaluatedGroups,
      });

      writtenItems.push({
        clause: 'HAVING',
        label: 'HAVING',
        span: core.havingSpan,
        stepIndex: stepIdxH,
      });

      activeGroups = keptGroups;
    }

    // Collapse groups into 1 InternalRow per kept group before SELECT
    currentRows = activeGroups.map((g) => ({
      id: g.groupId,
      cells: g.memberRows[0]?.cells ? { ...g.memberRows[0].cells } : {},
      sourceRowIds: g.memberRows.map((m) => m.id),
      groupRows: g.memberRows.map((m) => m.cells),
    }));
  }

  // 6. SELECT (Projection)
  const projectedCols: ColumnMeta[] = [];
  const projectedSourceColIds = new Set<string>();
  const selectEvaluators: Array<{
    col: ColumnMeta;
    expr?: Expr;
    sourceColId?: string;
  }> = [];

  core.selectItems.forEach((item, idx) => {
    if (item.expr.kind === 'star') {
      const targetTable = item.expr.table?.toLowerCase();
      const matchedCols = targetTable
        ? currentCols.filter(
            (c) =>
              c.tableAlias?.toLowerCase() === targetTable ||
              c.tableName?.toLowerCase() === targetTable
          )
        : currentCols;
      for (const mc of matchedCols) {
        projectedSourceColIds.add(mc.id);
        const colMeta: ColumnMeta = {
          ...mc,
          id: `sel_${projectedCols.length}_${mc.name}`,
          isSelected: true,
        };
        projectedCols.push(colMeta);
        selectEvaluators.push({ col: colMeta, sourceColId: mc.id });
      }
      return;
    }

    let sourceCol: ColumnMeta | undefined;
    if (item.expr.kind === 'column') {
      const cid = resolveColumnId(currentCols, item.expr.table, item.expr.name);
      if (cid) {
        sourceCol = currentCols.find((c) => c.id === cid);
        projectedSourceColIds.add(cid);
      }
    }

    const defaultName =
      item.alias ||
      (item.expr.kind === 'column' ? item.expr.name : item.rawSql);

    const hasAgg = containsAggregate(item.expr);
    const isComputed = item.expr.kind !== 'column';

    const colMeta: ColumnMeta = {
      id: `sel_${idx}_${defaultName}`,
      name: defaultName,
      qualifiedName: sourceCol ? sourceCol.qualifiedName : defaultName,
      tableAlias: sourceCol?.tableAlias,
      tableName: sourceCol?.tableName,
      sourceIndex: sourceCol ? sourceCol.sourceIndex : -1,
      expression: isComputed || item.alias ? item.rawSql : undefined,
      isSelected: true,
      isComputed,
      isAggregate: hasAgg,
      isGroupKey: Boolean(sourceCol && core.groupBy.some(
        (g) => g.kind === 'column' && resolveColumnId(currentCols, g.table, g.name) === sourceCol?.id
      )),
    };
    projectedCols.push(colMeta);
    selectEvaluators.push({ col: colMeta, expr: item.expr, sourceColId: sourceCol?.id });
  });

  // Dropped columns (only shown as dimmed toggleable columns when not grouped)
  const droppedCols: ColumnMeta[] = !isGrouped
    ? currentCols
        .filter((c) => !projectedSourceColIds.has(c.id))
        .map((c) => ({ ...c, isSelected: false }))
    : [];

  const selectDisplayCols = [...projectedCols, ...droppedCols];
  const projectedInternalRows: InternalRow[] = [];
  const selectTracedRows: TracedRow[] = [];

  for (const row of currentRows) {
    const ctx: EvalContext = {
      columns: currentCols,
      rowCells: row.cells,
      groupRows: row.groupRows,
      engine,
      subqueryCache,
    };

    const newCells: Record<string, SqlValue> = {};
    const aliasMap: Record<string, SqlValue> = {};

    for (const ev of selectEvaluators) {
      const val =
        ev.expr !== undefined
          ? evalExpr(ev.expr, ctx)
          : ev.sourceColId
            ? (row.cells[ev.sourceColId] ?? null)
            : null;
      newCells[ev.col.id] = val;
      aliasMap[ev.col.name] = val;
    }

    // Also include dropped columns in the display cells for the SELECT step only
    const displayCells: Record<string, SqlValue> = { ...newCells };
    for (const dc of droppedCols) {
      displayCells[dc.id] = row.cells[dc.id] ?? null;
    }

    projectedInternalRows.push({
      id: row.id,
      cells: newCells,
      sourceRowIds: row.sourceRowIds,
      joinSide: row.joinSide,
      groupRows: row.groupRows,
      preSelectCells: row.cells,
      preSelectColumns: currentCols,
      selectAliases: aliasMap,
    });

    selectTracedRows.push({
      id: row.id,
      cells: displayCells,
      status: 'kept',
      sourceRowIds: row.sourceRowIds,
      joinSide: row.joinSide,
    });
  }

  const stepIdxSel = steps.length;
  const computedCount = projectedCols.filter((c) => c.isComputed).length;
  steps.push({
    index: stepIdxSel,
    clause: 'SELECT',
    badgeLabel: 'SELECT',
    title: `Chiếu ${projectedCols.length} cột kết quả`,
    sqlSnippet: sliceSql(sql, core.selectSpan),
    span: core.selectSpan,
    explanation: `Chọn ra ${projectedCols.length} cột cần hiển thị (${projectedCols
      .map((c) => c.name)
      .join(', ')})${
      computedCount > 0 ? `, trong đó có ${computedCount} cột tính toán / hàm tổng hợp` : ''
    }${droppedCols.length > 0 ? ` và ẩn đi ${droppedCols.length} cột không sử dụng` : ''}.`,
    tip:
      droppedCols.length > 0
        ? 'Bật tùy chọn "Hiện cột bị ẩn" để so sánh các cột được giữ lại và các cột bị loại bỏ trong bước SELECT.'
        : 'Bí danh cột (AS ...) được gán tại bước này, nên ORDER BY ở bước sau có thể gọi trực tiếp tên bí danh.',
    inputCount: currentRows.length,
    outputCount: projectedInternalRows.length,
    unit: 'dòng',
    columns: selectDisplayCols,
    rows: selectTracedRows,
  });

  writtenItems.push({
    clause: 'SELECT',
    label: core.distinct ? 'SELECT DISTINCT' : 'SELECT',
    span: core.selectSpan,
    stepIndex: stepIdxSel,
  });

  currentCols = projectedCols;
  currentRows = projectedInternalRows;

  // 7. DISTINCT
  if (core.distinct) {
    const inputCount = currentRows.length;
    const seen = new Set<string>();
    const uniqueRows: InternalRow[] = [];
    const distinctTraced: TracedRow[] = [];

    for (const row of currentRows) {
      const key = buildRowTupleKey(currentCols, row.cells);
      const isDup = seen.has(key);
      if (!isDup) {
        seen.add(key);
        uniqueRows.push(row);
      }
      distinctTraced.push({
        id: row.id,
        cells: { ...row.cells },
        status: isDup ? 'duplicate' : 'kept',
        sourceRowIds: row.sourceRowIds,
      });
    }

    const dupCount = inputCount - uniqueRows.length;
    const stepIdxD = steps.length;
    steps.push({
      index: stepIdxD,
      clause: 'DISTINCT',
      badgeLabel: 'DISTINCT',
      title: 'Loại bỏ các dòng trùng lặp',
      sqlSnippet: 'DISTINCT',
      span: core.distinctSpan ?? core.selectSpan,
      explanation: `So sánh toàn bộ giá trị trên ${currentCols.length} cột đã chọn. Giữ lại ${uniqueRows.length} dòng duy nhất và loại bỏ ${dupCount} dòng trùng lặp.`,
      tip: 'DISTINCT luôn chạy sau bước chiếu cột SELECT, nên hai dòng có thể khác nhau ở bảng gốc nhưng vẫn bị xem là trùng nếu các cột SELECT giống hệt nhau.',
      inputCount,
      outputCount: uniqueRows.length,
      unit: 'dòng',
      columns: currentCols.map((c) => ({ ...c })),
      rows: distinctTraced,
    });

    currentRows = uniqueRows;
  }

  return { columns: currentCols, rows: currentRows };
}

function buildJoinExplanation(
  join: JoinClause,
  leftLabel: string,
  leftCount: number,
  rightTable: string,
  rightCount: number,
  conditionText: string,
  matchedPairs: number,
  leftOnly: number,
  rightOnly: number,
  outputCount: number
): string {
  switch (join.joinType) {
    case 'INNER':
      return `Ghép ${leftLabel} (${leftCount} dòng) với "${rightTable}" (${rightCount} dòng) theo điều kiện ${conditionText}. Tìm thấy ${matchedPairs} cặp dòng khớp; bỏ qua ${leftOnly} dòng bên trái và ${rightOnly} dòng bên phải không khớp.`;
    case 'LEFT':
      return `Giữ toàn bộ dòng bên trái (${leftLabel}, ${leftCount} dòng) khi nối với "${rightTable}" (${rightCount} dòng) theo ${conditionText}. Có ${matchedPairs} cặp khớp và ${leftOnly} dòng bên trái không khớp (điền NULL cho cột bên phải), tổng ${outputCount} dòng.`;
    case 'RIGHT':
      return `Giữ toàn bộ dòng bên phải ("${rightTable}", ${rightCount} dòng) khi nối theo ${conditionText}. Có ${matchedPairs} cặp khớp và ${rightOnly} dòng bên phải không khớp (điền NULL cho cột bên trái), tổng ${outputCount} dòng.`;
    case 'FULL':
      return `Kết hợp tất cả dòng từ cả hai phía theo ${conditionText}: ${matchedPairs} cặp khớp, ${leftOnly} dòng chỉ có bên trái và ${rightOnly} dòng chỉ có bên phải, tổng ${outputCount} dòng.`;
    case 'CROSS':
      return `Tích Đề-các (CROSS JOIN) ghép mỗi dòng bên trái (${leftCount}) với tất cả dòng bên phải (${rightCount}), tạo ra ${outputCount} dòng.`;
  }
}

export function executeAndTraceSql(
  engine: SqliteEngine,
  rawSql: string
): TraceExecutionResult {
  const sql = rawSql.trim();
  if (!sql) {
    return {
      ok: true,
      executionTimeMs: 0,
      sql,
      mode: 'empty',
      steps: [],
      writtenOrder: [],
      queryPlan: [],
    };
  }

  const startMs = performance.now();
  const firstKw = detectFirstKeyword(sql);

  // Handle DML / DDL statements cleanly with before/after table diff
  if (['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'REPLACE'].includes(firstKw)) {
    const stmtType: DmlDiffResult['statementType'] =
      firstKw === 'INSERT' || firstKw === 'REPLACE'
        ? 'INSERT'
        : firstKw === 'UPDATE'
          ? 'UPDATE'
          : firstKw === 'DELETE'
            ? 'DELETE'
            : 'DDL';
    const targetTable = extractDmlTargetTable(sql, stmtType);
    let beforeData: RawTableData | null = null;
    if (targetTable) {
      try {
        beforeData = engine.getTableData(targetTable);
      } catch {
        beforeData = null;
      }
    }

    try {
      engine.runStatement(sql);
      let afterData: RawTableData | null = null;
      if (targetTable) {
        try {
          afterData = engine.getTableData(targetTable);
        } catch {
          afterData = null;
        }
      }
      const dmlDiff = buildDmlDiff(stmtType, targetTable, beforeData, afterData);
      return {
        ok: true,
        executionTimeMs: Number((performance.now() - startMs).toFixed(2)),
        sql,
        mode: 'dml_diff',
        steps: [],
        writtenOrder: [],
        queryPlan: [],
        dmlDiff,
      };
    } catch (err) {
      const translated = translateSqliteError(err instanceof Error ? err.message : String(err));
      return {
        ok: false,
        error: translated.error,
        errorHint: translated.hint,
        executionTimeMs: Number((performance.now() - startMs).toFixed(2)),
        sql,
        mode: 'empty',
        steps: [],
        writtenOrder: [],
        queryPlan: [],
      };
    }
  }

  // SELECT / WITH / PRAGMA / etc. -> First run real SQLite WASM for accuracy & error checking
  let sqliteResult: { columns: string[]; rows: SqlValue[][] };
  try {
    sqliteResult = engine.execQuery(sql);
  } catch (err) {
    const translated = translateSqliteError(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      error: translated.error,
      errorHint: translated.hint,
      executionTimeMs: Number((performance.now() - startMs).toFixed(2)),
      sql,
      mode: 'empty',
      steps: [],
      writtenOrder: [],
      queryPlan: [],
    };
  }

  const queryPlan = engine.explainQueryPlan(sql);

  // Attempt step-by-step tracing
  try {
    const stmt: SelectStatement = parseSelectSql(sql);
    const steps: ExecutionStep[] = [];
    const writtenItems: Array<{
      clause: ClauseType;
      label: string;
      span: TextSpan;
      stepIndex: number;
    }> = [];
    const cteTables = new Map<string, RawTableData>();
    const subqueryCache = new Map<string, RawTableData>();

    // Materialize CTEs (WITH ...)
    if (stmt.ctes.length > 0 && stmt.cteSpan) {
      for (const cte of stmt.ctes) {
        const res = engine.execQuery(cte.subquerySql);
        cteTables.set(cte.name.toLowerCase(), res);
        const cteCols = makeColumnsForSource(res.columns, cte.name, cte.name, 0);
        const cteRows = makeRowsForSource(res.rows, cteCols, cte.name);
        const stepIdx = steps.length;
        steps.push({
          index: stepIdx,
          clause: 'CTE',
          badgeLabel: 'WITH CTE',
          title: `Tạo bảng tạm "${cte.name}"`,
          sqlSnippet: sliceSql(sql, cte.span),
          span: cte.span,
          explanation: `Thực thi truy vấn con CTE "${cte.name}" và lưu tạm ${cteRows.length} dòng để truy vấn chính phía dưới sử dụng.`,
          inputCount: cteRows.length,
          outputCount: cteRows.length,
          unit: 'dòng',
          columns: cteCols,
          rows: cteRows.map((r) => ({ id: r.id, cells: { ...r.cells }, status: 'kept' })),
        });
        writtenItems.push({
          clause: 'CTE',
          label: `WITH ${cte.name}`,
          span: cte.span,
          stepIndex: stepIdx,
        });
      }
    }

    const orderByExprs = stmt.orderBy.map((o) => o.expr);
    let { columns: currentCols, rows: currentRows } = traceSelectCore(
      stmt.core,
      sql,
      engine,
      cteTables,
      subqueryCache,
      orderByExprs,
      steps,
      writtenItems
    );

    // Handle Set Operation (UNION / UNION ALL / INTERSECT / EXCEPT)
    if (stmt.setOp) {
      const rightSql = sliceSql(sql, stmt.setOp.right.span);
      const rightRes = engine.execQuery(rightSql);
      const inputCount = currentRows.length;
      const rightInternal: InternalRow[] = rightRes.rows.map((vals, idx) => {
        const cells: Record<string, SqlValue> = {};
        currentCols.forEach((c, cIdx) => {
          cells[c.id] = vals[cIdx] ?? null;
        });
        return { id: `set-r-${idx + 1}`, cells, sourceRowIds: [`set-r-${idx + 1}`] };
      });

      const opType = stmt.setOp.type;
      const nextRows: InternalRow[] = [];
      const tracedRows: TracedRow[] = [];

      if (opType === 'UNION ALL') {
        const merged = [...currentRows, ...rightInternal];
        merged.forEach((r) => {
          nextRows.push(r);
          tracedRows.push({ id: r.id, cells: { ...r.cells }, status: 'kept' });
        });
      } else if (opType === 'UNION') {
        const seen = new Set<string>();
        for (const r of [...currentRows, ...rightInternal]) {
          const k = buildRowTupleKey(currentCols, r.cells);
          const dup = seen.has(k);
          if (!dup) {
            seen.add(k);
            nextRows.push(r);
          }
          tracedRows.push({ id: r.id, cells: { ...r.cells }, status: dup ? 'duplicate' : 'kept' });
        }
      } else if (opType === 'INTERSECT') {
        const rightKeys = new Set(rightInternal.map((r) => buildRowTupleKey(currentCols, r.cells)));
        const seen = new Set<string>();
        for (const r of currentRows) {
          const k = buildRowTupleKey(currentCols, r.cells);
          const ok = rightKeys.has(k) && !seen.has(k);
          if (ok) {
            seen.add(k);
            nextRows.push(r);
          }
          tracedRows.push({ id: r.id, cells: { ...r.cells }, status: ok ? 'kept' : 'filtered' });
        }
      } else if (opType === 'EXCEPT') {
        const rightKeys = new Set(rightInternal.map((r) => buildRowTupleKey(currentCols, r.cells)));
        const seen = new Set<string>();
        for (const r of currentRows) {
          const k = buildRowTupleKey(currentCols, r.cells);
          const ok = !rightKeys.has(k) && !seen.has(k);
          if (ok) {
            seen.add(k);
            nextRows.push(r);
          }
          tracedRows.push({ id: r.id, cells: { ...r.cells }, status: ok ? 'kept' : 'filtered' });
        }
      }

      const stepIdxSet = steps.length;
      steps.push({
        index: stepIdxSet,
        clause: 'SET_OP',
        badgeLabel: opType,
        title: `Phép tập hợp ${opType}`,
        sqlSnippet: opType,
        span: stmt.setOp.span,
        explanation: `Kết hợp ${inputCount} dòng nhánh trái với ${rightInternal.length} dòng nhánh phải bằng phép ${opType}, thu được ${nextRows.length} dòng.`,
        inputCount: inputCount + rightInternal.length,
        outputCount: nextRows.length,
        unit: 'dòng',
        columns: currentCols.map((c) => ({ ...c })),
        rows: tracedRows,
      });

      writtenItems.push({
        clause: 'SET_OP',
        label: opType,
        span: stmt.setOp.span,
        stepIndex: stepIdxSet,
      });

      currentRows = nextRows;
    }

    // 8. ORDER BY
    if (stmt.orderBy.length > 0 && stmt.orderBySpan) {
      const sortMeta = stmt.orderBy.map((o) => {
        // Resolve which projected column this ORDER BY targets (if any)
        let targetColId: string | null = null;
        if (o.expr.kind === 'literal' && typeof o.expr.value === 'number') {
          const posIdx = o.expr.value - 1;
          if (posIdx >= 0 && posIdx < currentCols.length) {
            targetColId = currentCols[posIdx].id;
          }
        } else if (o.expr.kind === 'column') {
          targetColId = resolveColumnId(currentCols, o.expr.table, o.expr.name);
        }
        return {
          item: o,
          targetColId,
          label: o.rawSql,
        };
      });

      const decorated = currentRows.map((row, prevIdx) => {
        const keyVals = sortMeta.map(({ item }) => {
          // Positional sort: ORDER BY 1, 2...
          if (item.expr.kind === 'literal' && typeof item.expr.value === 'number') {
            const posIdx = item.expr.value - 1;
            if (posIdx >= 0 && posIdx < currentCols.length) {
              return row.cells[currentCols[posIdx].id] ?? null;
            }
          }
          // Evaluate against projected columns + aliases + pre-select columns
          const mergedCols = [...currentCols, ...(row.preSelectColumns ?? [])];
          const mergedCells = { ...(row.preSelectCells ?? {}), ...row.cells };
          return evalExpr(item.expr, {
            columns: mergedCols,
            rowCells: mergedCells,
            groupRows: row.groupRows,
            selectAliases: row.selectAliases,
            engine,
            subqueryCache,
          });
        });

        return { row, prevRank: prevIdx + 1, keyVals };
      });

      decorated.sort((a, b) => {
        for (let i = 0; i < sortMeta.length; i++) {
          const { item } = sortMeta[i];
          const va = a.keyVals[i];
          const vb = b.keyVals[i];

          if (va === null && vb === null) continue;
          if (va === null || vb === null) {
            const nullsFirst =
              item.nulls === 'FIRST'
                ? true
                : item.nulls === 'LAST'
                  ? false
                  : item.direction === 'ASC';
            if (va === null) return nullsFirst ? -1 : 1;
            return nullsFirst ? 1 : -1;
          }

          const cmp = compareSqlValues(va, vb);
          if (cmp !== 0) {
            return item.direction === 'DESC' ? -cmp : cmp;
          }
        }
        return a.prevRank - b.prevRank; // stable sort
      });

      const orderedCols = currentCols.map((c) => {
        const match = sortMeta.find((s) => s.targetColId === c.id);
        return match
          ? { ...c, isSortKey: true, sortDirection: match.item.direction }
          : { ...c, isSortKey: false, sortDirection: undefined };
      });

      const movedCount = decorated.filter((d, idx) => d.prevRank !== idx + 1).length;
      const orderDesc = stmt.orderBy
        .map(
          (o) =>
            `${exprToReadableSql(o.expr)} (${o.direction === 'DESC' ? 'giảm dần' : 'tăng dần'})`
        )
        .join(', ');

      const stepIdxOrd = steps.length;
      steps.push({
        index: stepIdxOrd,
        clause: 'ORDER_BY',
        badgeLabel: 'ORDER BY',
        title: `Sắp xếp theo ${stmt.orderBy.map((o) => exprToReadableSql(o.expr)).join(', ')}`,
        sqlSnippet: sliceSql(sql, stmt.orderBySpan),
        span: stmt.orderBySpan,
        explanation: `Sắp xếp ${decorated.length} dòng theo ${orderDesc}. Có ${movedCount} dòng thay đổi vị trí so với bước trước.`,
        tip: 'Mũi tên thứ hạng (#cũ → #mới) bên trái mỗi dòng cho biết vị trí đã thay đổi như thế nào sau khi sắp xếp.',
        inputCount: decorated.length,
        outputCount: decorated.length,
        unit: 'dòng',
        columns: orderedCols,
        sortKeys: sortMeta.map((s) => ({
          columnId: s.targetColId ?? '',
          label: s.label,
          direction: s.item.direction,
        })),
        rows: decorated.map((d, idx) => ({
          id: d.row.id,
          cells: { ...d.row.cells },
          status: 'kept',
          sourceRowIds: d.row.sourceRowIds,
          prevRank: d.prevRank,
          newRank: idx + 1,
          sortKeyValues: d.keyVals,
        })),
      });

      writtenItems.push({
        clause: 'ORDER_BY',
        label: 'ORDER BY',
        span: stmt.orderBySpan,
        stepIndex: stepIdxOrd,
      });

      currentCols = orderedCols;
      currentRows = decorated.map((d) => d.row);
    }

    // 9. LIMIT / OFFSET
    if (stmt.limit) {
      const limitVal = Math.max(
        0,
        Number(
          evalExpr(stmt.limit.limit, {
            columns: [],
            rowCells: {},
            engine,
            subqueryCache,
          }) ?? 0
        )
      );
      const offsetVal = stmt.limit.offset
        ? Math.max(
            0,
            Number(
              evalExpr(stmt.limit.offset, {
                columns: [],
                rowCells: {},
                engine,
                subqueryCache,
              }) ?? 0
            )
          )
        : 0;

      const inputCount = currentRows.length;
      const keptRows: InternalRow[] = [];
      const limitTraced: TracedRow[] = [];

      currentRows.forEach((row, idx) => {
        if (idx < offsetVal) {
          limitTraced.push({
            id: row.id,
            cells: { ...row.cells },
            status: 'skipped_offset',
            newRank: idx + 1,
          });
        } else if (idx < offsetVal + limitVal) {
          keptRows.push(row);
          limitTraced.push({
            id: row.id,
            cells: { ...row.cells },
            status: 'kept',
            newRank: idx + 1,
          });
        } else {
          limitTraced.push({
            id: row.id,
            cells: { ...row.cells },
            status: 'truncated_limit',
            newRank: idx + 1,
          });
        }
      });

      const stepIdxLim = steps.length;
      steps.push({
        index: stepIdxLim,
        clause: 'LIMIT',
        badgeLabel: offsetVal > 0 ? 'LIMIT / OFFSET' : 'LIMIT',
        title:
          offsetVal > 0
            ? `Bỏ qua ${offsetVal} dòng đầu và lấy ${limitVal} dòng`
            : `Giới hạn tối đa ${limitVal} dòng đầu tiên`,
        sqlSnippet: sliceSql(sql, stmt.limit.span),
        span: stmt.limit.span,
        explanation:
          offsetVal > 0
            ? `Bỏ qua ${Math.min(offsetVal, inputCount)} dòng đầu (OFFSET ${offsetVal}), sau đó giữ lại ${keptRows.length} dòng tiếp theo (LIMIT ${limitVal}) và cắt bỏ phần còn lại.`
            : `Chỉ giữ lại ${keptRows.length} dòng đầu tiên trong tổng số ${inputCount} dòng đã sắp xếp, cắt bỏ ${
                inputCount - keptRows.length
              } dòng phía sau.`,
        tip: 'LIMIT / OFFSET luôn chạy ở bước cuối cùng sau khi ORDER BY đã hoàn tất sắp xếp.',
        inputCount,
        outputCount: keptRows.length,
        unit: 'dòng',
        columns: currentCols.map((c) => ({ ...c })),
        rows: limitTraced,
        limitInfo: { limit: limitVal, offset: offsetVal },
      });

      writtenItems.push({
        clause: 'LIMIT',
        label: offsetVal > 0 ? 'LIMIT / OFFSET' : 'LIMIT',
        span: stmt.limit.span,
        stepIndex: stepIdxLim,
      });

      currentRows = keptRows;
    }

    // Build Written Order vs. Logical Execution Order mapping
    const sortedByWritten = [...writtenItems].sort((a, b) => a.span.start - b.span.start);
    const writtenOrder: WrittenClauseOrderItem[] = sortedByWritten.map((item, idx) => ({
      clause: item.clause,
      label: item.label,
      sqlSnippet: sliceSql(sql, item.span),
      writtenOrder: idx + 1,
      executionOrder: item.stepIndex + 1,
      span: item.span,
    }));

    const verifiedWithSqlite = verifyAgainstSqlite(
      steps,
      sqliteResult,
      stmt.orderBy.length > 0
    );

    return {
      ok: true,
      executionTimeMs: Number((performance.now() - startMs).toFixed(2)),
      sql,
      mode: 'select_traced',
      steps,
      writtenOrder,
      sqliteResult,
      queryPlan,
      verifiedWithSqlite,
    };
  } catch (traceErr) {
    // Graceful fallback: SQLite succeeded, show real SQLite table & EXPLAIN QUERY PLAN!
    return {
      ok: true,
      executionTimeMs: Number((performance.now() - startMs).toFixed(2)),
      sql,
      mode: 'select_sqlite_only',
      steps: [],
      writtenOrder: [],
      sqliteResult,
      queryPlan,
      fallbackReason:
        traceErr instanceof Error
          ? traceErr.message
          : 'Câu lệnh sử dụng cú pháp nâng cao — đã thực thi trực tiếp trên SQLite WASM.',
    };
  }
}
