import type { TextSpan } from '../types/sql';

export type Expr =
  | { kind: 'literal'; value: string | number | boolean | null; span: TextSpan }
  | { kind: 'column'; table?: string; name: string; span: TextSpan }
  | { kind: 'star'; table?: string; span: TextSpan }
  | { kind: 'unary'; op: 'NOT' | '-' | '+'; operand: Expr; span: TextSpan }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; span: TextSpan }
  | {
      kind: 'function';
      name: string;
      distinct: boolean;
      args: Expr[];
      span: TextSpan;
    }
  | { kind: 'is_null'; expr: Expr; negated: boolean; span: TextSpan }
  | { kind: 'between'; expr: Expr; low: Expr; high: Expr; negated: boolean; span: TextSpan }
  | {
      kind: 'in_list';
      expr: Expr;
      values: Expr[];
      negated: boolean;
      span: TextSpan;
    }
  | {
      kind: 'in_subquery';
      expr: Expr;
      subquerySql: string;
      negated: boolean;
      span: TextSpan;
    }
  | { kind: 'exists'; subquerySql: string; negated: boolean; span: TextSpan }
  | { kind: 'scalar_subquery'; subquerySql: string; span: TextSpan }
  | {
      kind: 'case';
      base?: Expr;
      whens: Array<{ cond: Expr; result: Expr }>;
      elseExpr?: Expr;
      span: TextSpan;
    }
  | { kind: 'cast'; expr: Expr; targetType: string; span: TextSpan };

export interface SelectItem {
  expr: Expr;
  alias?: string;
  rawSql: string;
  span: TextSpan;
}

export interface TableSource {
  kind: 'table' | 'subquery';
  tableName?: string;
  subquerySql?: string;
  alias?: string;
  span: TextSpan;
}

export type JoinKind = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';

export interface JoinClause {
  joinType: JoinKind;
  natural?: boolean;
  table: TableSource;
  on?: Expr;
  using?: string[];
  span: TextSpan;
}

export interface OrderByItem {
  expr: Expr;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
  rawSql: string;
  span: TextSpan;
}

export interface LimitClause {
  limit: Expr;
  offset?: Expr;
  span: TextSpan;
}

export interface CteDef {
  name: string;
  subquerySql: string;
  span: TextSpan;
}

export interface SelectCore {
  distinct: boolean;
  distinctSpan?: TextSpan;
  selectItems: SelectItem[];
  selectSpan: TextSpan;
  from?: TableSource;
  fromSpan?: TextSpan;
  joins: JoinClause[];
  where?: Expr;
  whereSpan?: TextSpan;
  groupBy: Expr[];
  groupBySpan?: TextSpan;
  having?: Expr;
  havingSpan?: TextSpan;
  span: TextSpan;
}

export type SetOpType = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'EXCEPT';

export interface SelectStatement {
  ctes: CteDef[];
  cteSpan?: TextSpan;
  core: SelectCore;
  setOp?: {
    type: SetOpType;
    right: SelectStatement;
    span: TextSpan;
  };
  orderBy: OrderByItem[];
  orderBySpan?: TextSpan;
  limit?: LimitClause;
  span: TextSpan;
}
