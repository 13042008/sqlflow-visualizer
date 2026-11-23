export type SqlValue = string | number | null | Uint8Array;

export type ClauseType =
  | 'CTE'
  | 'FROM'
  | 'JOIN'
  | 'WHERE'
  | 'GROUP_BY'
  | 'HAVING'
  | 'SELECT'
  | 'DISTINCT'
  | 'ORDER_BY'
  | 'LIMIT'
  | 'SET_OP';

export interface TextSpan {
  start: number;
  end: number;
}

export interface TableColumnSchema {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
  fk?: {
    table: string;
    column: string;
  };
}

export interface TableSchema {
  name: string;
  columns: TableColumnSchema[];
  rowCount: number;
}

export interface ColumnMeta {
  id: string;
  name: string;
  qualifiedName: string;
  tableAlias?: string;
  tableName?: string;
  sourceIndex: number;
  expression?: string;
  isSelected?: boolean;
  isComputed?: boolean;
  isSortKey?: boolean;
  sortDirection?: 'ASC' | 'DESC';
  isGroupKey?: boolean;
  isAggregate?: boolean;
}

export interface RowEvaluation {
  expression: string;
  substituted: string;
  result: boolean | null;
}

export type TracedRowStatus =
  | 'kept'
  | 'filtered'
  | 'unmatched_null'
  | 'duplicate'
  | 'skipped_offset'
  | 'truncated_limit';

export interface TracedRow {
  id: string;
  cells: Record<string, SqlValue>;
  status: TracedRowStatus;
  evaluation?: RowEvaluation;
  sourceRowIds?: string[];
  joinSide?: 'matched' | 'left_only' | 'right_only';
  groupId?: string;
  prevRank?: number;
  newRank?: number;
  sortKeyValues?: SqlValue[];
}

export interface GroupBucket {
  groupId: string;
  keyValues: Record<string, SqlValue>;
  keyLabel: string;
  memberRows: TracedRow[];
  aggregates: Record<string, SqlValue>;
  status: 'kept' | 'filtered';
  evaluation?: RowEvaluation;
}

export interface JoinSideRow {
  id: string;
  cells: Record<string, SqlValue>;
  matchCount: number;
}

export interface JoinPreviewData {
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  leftLabel: string;
  rightLabel: string;
  leftTableAlias: string;
  rightTableAlias: string;
  leftColumns: ColumnMeta[];
  rightColumns: ColumnMeta[];
  leftRows: JoinSideRow[];
  rightRows: JoinSideRow[];
  conditionText: string;
  matchedPairsCount: number;
  leftOnlyCount: number;
  rightOnlyCount: number;
}

export interface ExecutionStep {
  index: number;
  clause: ClauseType;
  badgeLabel: string;
  title: string;
  sqlSnippet: string;
  span?: TextSpan;
  explanation: string;
  tip?: string;
  inputCount: number;
  outputCount: number;
  unit: 'dòng' | 'nhóm';
  columns: ColumnMeta[];
  rows: TracedRow[];
  groups?: GroupBucket[];
  joinPreview?: JoinPreviewData;
  sortKeys?: Array<{
    columnId: string;
    label: string;
    direction: 'ASC' | 'DESC';
  }>;
  limitInfo?: {
    limit?: number;
    offset?: number;
  };
}

export interface WrittenClauseOrderItem {
  clause: ClauseType;
  label: string;
  sqlSnippet: string;
  writtenOrder: number;
  executionOrder: number;
  span: TextSpan;
}

export interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export interface DmlDiffRow {
  status: 'added' | 'removed' | 'updated' | 'unchanged';
  before?: Record<string, SqlValue>;
  after?: Record<string, SqlValue>;
  changedColumns?: string[];
}

export interface DmlDiffResult {
  statementType: 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL';
  tableName?: string;
  message: string;
  columns: string[];
  diffRows: DmlDiffRow[];
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
}

export interface TraceExecutionResult {
  ok: boolean;
  error?: string;
  errorHint?: string;
  executionTimeMs: number;
  sql: string;
  mode: 'select_traced' | 'select_sqlite_only' | 'dml_diff' | 'empty';
  steps: ExecutionStep[];
  writtenOrder: WrittenClauseOrderItem[];
  sqliteResult?: {
    columns: string[];
    rows: SqlValue[][];
  };
  queryPlan: QueryPlanRow[];
  dmlDiff?: DmlDiffResult;
  fallbackReason?: string;
  verifiedWithSqlite?: boolean;
}

export type QueryDifficulty = 'Cơ bản' | 'Trung bình' | 'Nâng cao';

export interface DatasetPresetQuery {
  id: string;
  title: string;
  level: QueryDifficulty;
  tags: string[];
  description: string;
  sql: string;
}

export interface SampleDataset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: 'graduation' | 'shopping' | 'briefcase';
  schemaSql: string;
  seedSql: string;
  presets: DatasetPresetQuery[];
}
