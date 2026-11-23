import type {
  CteDef,
  Expr,
  JoinClause,
  JoinKind,
  LimitClause,
  OrderByItem,
  SelectCore,
  SelectItem,
  SelectStatement,
  SetOpType,
  TableSource,
} from './ast';
import { tokenizeSql, type Token } from './lexer';

const CLAUSE_STOP_KEYWORDS = new Set([
  'FROM',
  'WHERE',
  'GROUP',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
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
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'SET',
]);

class SqlParser {
  private tokens: Token[];
  private pos = 0;
  private sql: string;

  constructor(sql: string) {
    this.sql = sql;
    this.tokens = tokenizeSql(sql);
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.type !== 'EOF') this.pos++;
    return tok;
  }

  private matchKeyword(...words: string[]): Token | null {
    const tok = this.peek();
    if (tok.type === 'KEYWORD' && words.includes(tok.upper)) {
      return this.advance();
    }
    return null;
  }

  private isKeyword(...words: string[]): boolean {
    const tok = this.peek();
    return tok.type === 'KEYWORD' && words.includes(tok.upper);
  }

  private expectKeyword(word: string): Token {
    const tok = this.peek();
    if (tok.type === 'KEYWORD' && tok.upper === word) {
      return this.advance();
    }
    throw new Error(`Mong đợi từ khóa ${word}, nhưng gặp "${tok.value || 'EOF'}"`);
  }

  private matchPunct(p: string): Token | null {
    const tok = this.peek();
    if (tok.type === 'PUNCT' && tok.value === p) {
      return this.advance();
    }
    return null;
  }

  private expectPunct(p: string): Token {
    const tok = this.peek();
    if (tok.type === 'PUNCT' && tok.value === p) {
      return this.advance();
    }
    throw new Error(`Mong đợi "${p}", nhưng gặp "${tok.value || 'EOF'}"`);
  }

  private parseIdentifierName(): Token {
    const tok = this.peek();
    if (tok.type === 'IDENT' || (tok.type === 'KEYWORD' && !CLAUSE_STOP_KEYWORDS.has(tok.upper))) {
      return this.advance();
    }
    throw new Error(`Mong đợi tên định danh, nhưng gặp "${tok.value || 'EOF'}"`);
  }

  parseStatement(): SelectStatement {
    const startTok = this.peek();
    const ctes: CteDef[] = [];
    let cteSpan: { start: number; end: number } | undefined;

    if (this.isKeyword('WITH')) {
      const withTok = this.advance();
      if (this.isKeyword('RECURSIVE')) {
        throw new Error('RECURSIVE CTE hiện chưa hỗ trợ trực quan hóa từng bước.');
      }
      do {
        const nameTok = this.parseIdentifierName();
        this.expectKeyword('AS');
        const sub = this.captureParenthesizedSql();
        ctes.push({
          name: nameTok.value,
          subquerySql: sub.innerSql,
          span: { start: nameTok.start, end: sub.end },
        });
      } while (this.matchPunct(','));
      cteSpan = { start: withTok.start, end: ctes[ctes.length - 1].span.end };
    }

    const core = this.parseSelectCore();

    let setOp: SelectStatement['setOp'];
    if (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) {
      const opTok = this.advance();
      let type: SetOpType = opTok.upper as SetOpType;
      let opEnd = opTok.end;
      if (opTok.upper === 'UNION' && this.matchKeyword('ALL')) {
        type = 'UNION ALL';
        opEnd = this.tokens[this.pos - 1].end;
      }
      const right = this.parseStatementWithoutTail();
      setOp = {
        type,
        right,
        span: { start: opTok.start, end: opEnd },
      };
    }

    const { orderBy, orderBySpan } = this.parseOrderBy();
    const limit = this.parseLimit();

    while (this.matchPunct(';')) {
      // consume trailing semicolons
    }

    if (this.peek().type !== 'EOF') {
      throw new Error(`Token không mong đợi "${this.peek().value}"`);
    }

    const lastEnd =
      limit?.span.end ??
      orderBySpan?.end ??
      setOp?.right.span.end ??
      core.span.end;

    return {
      ctes,
      cteSpan,
      core,
      setOp,
      orderBy,
      orderBySpan,
      limit,
      span: { start: startTok.start, end: lastEnd },
    };
  }

  private parseStatementWithoutTail(): SelectStatement {
    const startTok = this.peek();
    const core = this.parseSelectCore();
    let setOp: SelectStatement['setOp'];
    if (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) {
      const opTok = this.advance();
      let type: SetOpType = opTok.upper as SetOpType;
      let opEnd = opTok.end;
      if (opTok.upper === 'UNION' && this.matchKeyword('ALL')) {
        type = 'UNION ALL';
        opEnd = this.tokens[this.pos - 1].end;
      }
      const right = this.parseStatementWithoutTail();
      setOp = { type, right, span: { start: opTok.start, end: opEnd } };
    }
    return {
      ctes: [],
      core,
      setOp,
      orderBy: [],
      span: { start: startTok.start, end: setOp?.right.span.end ?? core.span.end },
    };
  }

  private parseSelectCore(): SelectCore {
    const selectTok = this.expectKeyword('SELECT');
    let distinct = false;
    let distinctSpan: { start: number; end: number } | undefined;

    if (this.isKeyword('DISTINCT')) {
      const dTok = this.advance();
      distinct = true;
      distinctSpan = { start: dTok.start, end: dTok.end };
    } else if (this.isKeyword('ALL')) {
      this.advance();
    }

    const selectItems: SelectItem[] = [];
    do {
      const itemStart = this.peek().start;
      const expr = this.parseExpr();
      // Window functions (OVER (...)) -> trigger graceful SQLite fallback
      if (this.isKeyword('OVER')) {
        throw new Error('Window function (OVER) hiện chạy trực tiếp qua SQLite WASM.');
      }
      let alias: string | undefined;
      let itemEnd = expr.span.end;
      if (this.matchKeyword('AS')) {
        const aTok = this.parseAliasToken();
        alias = aTok.value;
        itemEnd = aTok.end;
      } else if (this.canBeImplicitAlias()) {
        const aTok = this.parseAliasToken();
        alias = aTok.value;
        itemEnd = aTok.end;
      }
      selectItems.push({
        expr,
        alias,
        rawSql: this.sql.slice(itemStart, itemEnd).trim(),
        span: { start: itemStart, end: itemEnd },
      });
    } while (this.matchPunct(','));

    const selectSpan = {
      start: selectTok.start,
      end: selectItems[selectItems.length - 1].span.end,
    };

    let from: TableSource | undefined;
    let fromSpan: { start: number; end: number } | undefined;
    const joins: JoinClause[] = [];

    if (this.isKeyword('FROM')) {
      const fromTok = this.advance();
      from = this.parseTableSource();
      fromSpan = { start: fromTok.start, end: from.span.end };

      // Implicit comma joins: FROM a, b
      while (this.matchPunct(',')) {
        const commaEnd = this.tokens[this.pos - 1].start;
        const rightTable = this.parseTableSource();
        joins.push({
          joinType: 'CROSS',
          table: rightTable,
          span: { start: commaEnd, end: rightTable.span.end },
        });
      }

      // Explicit JOIN clauses
      while (this.isJoinStart()) {
        joins.push(this.parseJoinClause());
      }
    }

    let where: Expr | undefined;
    let whereSpan: { start: number; end: number } | undefined;
    if (this.isKeyword('WHERE')) {
      const wTok = this.advance();
      where = this.parseExpr();
      whereSpan = { start: wTok.start, end: where.span.end };
    }

    const groupBy: Expr[] = [];
    let groupBySpan: { start: number; end: number } | undefined;
    if (this.isKeyword('GROUP')) {
      const gTok = this.advance();
      this.expectKeyword('BY');
      do {
        groupBy.push(this.parseExpr());
      } while (this.matchPunct(','));
      groupBySpan = {
        start: gTok.start,
        end: groupBy[groupBy.length - 1].span.end,
      };
    }

    let having: Expr | undefined;
    let havingSpan: { start: number; end: number } | undefined;
    if (this.isKeyword('HAVING')) {
      const hTok = this.advance();
      having = this.parseExpr();
      havingSpan = { start: hTok.start, end: having.span.end };
    }

    const coreEnd =
      havingSpan?.end ??
      groupBySpan?.end ??
      whereSpan?.end ??
      (joins.length ? joins[joins.length - 1].span.end : undefined) ??
      fromSpan?.end ??
      selectSpan.end;

    return {
      distinct,
      distinctSpan,
      selectItems,
      selectSpan,
      from,
      fromSpan,
      joins,
      where,
      whereSpan,
      groupBy,
      groupBySpan,
      having,
      havingSpan,
      span: { start: selectTok.start, end: coreEnd },
    };
  }

  private parseAliasToken(): Token {
    const tok = this.peek();
    if (tok.type === 'IDENT' || tok.type === 'STRING') {
      return this.advance();
    }
    if (tok.type === 'KEYWORD' && !CLAUSE_STOP_KEYWORDS.has(tok.upper)) {
      return this.advance();
    }
    throw new Error(`Tên bí danh không hợp lệ: "${tok.value}"`);
  }

  private canBeImplicitAlias(): boolean {
    const tok = this.peek();
    if (tok.type === 'IDENT') return true;
    return false;
  }

  private parseTableSource(): TableSource {
    if (this.peek().type === 'PUNCT' && this.peek().value === '(') {
      const sub = this.captureParenthesizedSql();
      let alias: string | undefined;
      let end = sub.end;
      if (this.matchKeyword('AS')) {
        const aTok = this.parseAliasToken();
        alias = aTok.value;
        end = aTok.end;
      } else if (this.canBeImplicitAlias()) {
        const aTok = this.parseAliasToken();
        alias = aTok.value;
        end = aTok.end;
      }
      return {
        kind: 'subquery',
        subquerySql: sub.innerSql,
        alias: alias ?? 'subquery',
        span: { start: sub.start, end },
      };
    }

    const nameTok = this.parseIdentifierName();
    let alias: string | undefined;
    let end = nameTok.end;
    if (this.matchKeyword('AS')) {
      const aTok = this.parseAliasToken();
      alias = aTok.value;
      end = aTok.end;
    } else if (this.canBeImplicitAlias()) {
      const aTok = this.parseAliasToken();
      alias = aTok.value;
      end = aTok.end;
    }

    return {
      kind: 'table',
      tableName: nameTok.value,
      alias,
      span: { start: nameTok.start, end },
    };
  }

  private isJoinStart(): boolean {
    return this.isKeyword('JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL');
  }

  private parseJoinClause(): JoinClause {
    const startTok = this.peek();
    let natural = false;
    let joinType: JoinKind = 'INNER';

    if (this.matchKeyword('NATURAL')) {
      natural = true;
    }

    if (this.matchKeyword('INNER')) {
      joinType = 'INNER';
      this.expectKeyword('JOIN');
    } else if (this.matchKeyword('LEFT')) {
      joinType = 'LEFT';
      this.matchKeyword('OUTER');
      this.expectKeyword('JOIN');
    } else if (this.matchKeyword('RIGHT')) {
      joinType = 'RIGHT';
      this.matchKeyword('OUTER');
      this.expectKeyword('JOIN');
    } else if (this.matchKeyword('FULL')) {
      joinType = 'FULL';
      this.matchKeyword('OUTER');
      this.expectKeyword('JOIN');
    } else if (this.matchKeyword('CROSS')) {
      joinType = 'CROSS';
      this.expectKeyword('JOIN');
    } else {
      this.expectKeyword('JOIN');
      joinType = 'INNER';
    }

    const table = this.parseTableSource();
    let on: Expr | undefined;
    let using: string[] | undefined;
    let end = table.span.end;

    if (this.matchKeyword('ON')) {
      on = this.parseExpr();
      end = on.span.end;
    } else if (this.matchKeyword('USING')) {
      this.expectPunct('(');
      using = [];
      do {
        using.push(this.parseIdentifierName().value);
      } while (this.matchPunct(','));
      const closeTok = this.expectPunct(')');
      end = closeTok.end;
    }

    return {
      joinType,
      natural,
      table,
      on,
      using,
      span: { start: startTok.start, end },
    };
  }

  private parseOrderBy(): { orderBy: OrderByItem[]; orderBySpan?: { start: number; end: number } } {
    if (!this.isKeyword('ORDER')) return { orderBy: [] };
    const orderTok = this.advance();
    this.expectKeyword('BY');

    const items: OrderByItem[] = [];
    do {
      const start = this.peek().start;
      const expr = this.parseExpr();
      let direction: 'ASC' | 'DESC' = 'ASC';
      let end = expr.span.end;
      if (this.matchKeyword('ASC')) {
        direction = 'ASC';
        end = this.tokens[this.pos - 1].end;
      } else if (this.matchKeyword('DESC')) {
        direction = 'DESC';
        end = this.tokens[this.pos - 1].end;
      }
      let nulls: 'FIRST' | 'LAST' | undefined;
      if (this.matchKeyword('NULLS')) {
        if (this.matchKeyword('FIRST')) {
          nulls = 'FIRST';
          end = this.tokens[this.pos - 1].end;
        } else if (this.matchKeyword('LAST')) {
          nulls = 'LAST';
          end = this.tokens[this.pos - 1].end;
        }
      }
      items.push({
        expr,
        direction,
        nulls,
        rawSql: this.sql.slice(start, end).trim(),
        span: { start, end },
      });
    } while (this.matchPunct(','));

    return {
      orderBy: items,
      orderBySpan: { start: orderTok.start, end: items[items.length - 1].span.end },
    };
  }

  private parseLimit(): LimitClause | undefined {
    if (!this.isKeyword('LIMIT')) return undefined;
    const limitTok = this.advance();
    const first = this.parseExpr();
    let limit = first;
    let offset: Expr | undefined;
    let end = first.span.end;

    if (this.matchKeyword('OFFSET')) {
      offset = this.parseExpr();
      end = offset.span.end;
    } else if (this.matchPunct(',')) {
      // SQLite/MySQL syntax: LIMIT offset, count
      offset = first;
      limit = this.parseExpr();
      end = limit.span.end;
    }

    return {
      limit,
      offset,
      span: { start: limitTok.start, end },
    };
  }

  private captureParenthesizedSql(): { innerSql: string; start: number; end: number } {
    const openTok = this.expectPunct('(');
    let depth = 1;
    const innerStart = openTok.end;
    let closeTok = openTok;

    while (depth > 0 && this.peek().type !== 'EOF') {
      const tok = this.advance();
      if (tok.type === 'PUNCT' && tok.value === '(') depth++;
      else if (tok.type === 'PUNCT' && tok.value === ')') {
        depth--;
        if (depth === 0) closeTok = tok;
      }
    }
    if (depth !== 0) {
      throw new Error('Thiếu dấu ngoặc đóng ")"');
    }
    return {
      innerSql: this.sql.slice(innerStart, closeTok.start).trim(),
      start: openTok.start,
      end: closeTok.end,
    };
  }

  // Expression precedence: OR -> AND -> NOT -> Comparison -> Additive/Concat -> Multiplicative -> Unary -> Primary
  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.matchKeyword('OR')) {
      const right = this.parseAnd();
      left = {
        kind: 'binary',
        op: 'OR',
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.matchKeyword('AND')) {
      const right = this.parseNot();
      left = {
        kind: 'binary',
        op: 'AND',
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKeyword('NOT')) {
      const notTok = this.advance();
      if (this.isKeyword('EXISTS')) {
        this.advance();
        const sub = this.captureParenthesizedSql();
        return {
          kind: 'exists',
          subquerySql: sub.innerSql,
          negated: true,
          span: { start: notTok.start, end: sub.end },
        };
      }
      const operand = this.parseNot();
      return {
        kind: 'unary',
        op: 'NOT',
        operand,
        span: { start: notTok.start, end: operand.span.end },
      };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();

    while (true) {
      // IS [NOT] NULL
      if (this.matchKeyword('IS')) {
        const negated = Boolean(this.matchKeyword('NOT'));
        if (this.isKeyword('NULL')) {
          const nullTok = this.advance();
          left = {
            kind: 'is_null',
            expr: left,
            negated,
            span: { start: left.span.start, end: nullTok.end },
          };
          continue;
        }
        // IS [NOT] expr (SQLite IS operator)
        const right = this.parseAdditive();
        left = {
          kind: 'binary',
          op: negated ? 'IS NOT' : 'IS',
          left,
          right,
          span: { start: left.span.start, end: right.span.end },
        };
        continue;
      }

      // [NOT] BETWEEN / IN / LIKE
      let negated = false;
      const savedPos = this.pos;
      if (this.matchKeyword('NOT')) {
        negated = true;
      }

      if (this.matchKeyword('BETWEEN')) {
        const low = this.parseAdditive();
        this.expectKeyword('AND');
        const high = this.parseAdditive();
        left = {
          kind: 'between',
          expr: left,
          low,
          high,
          negated,
          span: { start: left.span.start, end: high.span.end },
        };
        continue;
      }

      if (this.matchKeyword('IN')) {
        if (this.peek().type === 'PUNCT' && this.peek().value === '(') {
          const next = this.peek(1);
          if (next.type === 'KEYWORD' && (next.upper === 'SELECT' || next.upper === 'WITH')) {
            const sub = this.captureParenthesizedSql();
            left = {
              kind: 'in_subquery',
              expr: left,
              subquerySql: sub.innerSql,
              negated,
              span: { start: left.span.start, end: sub.end },
            };
            continue;
          }
          this.expectPunct('(');
          const values: Expr[] = [];
          if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
            do {
              values.push(this.parseExpr());
            } while (this.matchPunct(','));
          }
          const closeTok = this.expectPunct(')');
          left = {
            kind: 'in_list',
            expr: left,
            values,
            negated,
            span: { start: left.span.start, end: closeTok.end },
          };
          continue;
        }
        throw new Error('Sau toán tử IN cần có danh sách trong dấu ngoặc đơn "(...)".');
      }

      if (this.matchKeyword('LIKE')) {
        const right = this.parseAdditive();
        left = {
          kind: 'binary',
          op: negated ? 'NOT LIKE' : 'LIKE',
          left,
          right,
          span: { start: left.span.start, end: right.span.end },
        };
        continue;
      }

      if (negated) {
        // restore if NOT wasn't followed by BETWEEN/IN/LIKE
        this.pos = savedPos;
      }

      // Standard comparison operators
      const tok = this.peek();
      if (
        tok.type === 'OP' &&
        ['=', '==', '!=', '<>', '<', '<=', '>', '>='].includes(tok.value)
      ) {
        this.advance();
        const right = this.parseAdditive();
        left = {
          kind: 'binary',
          op: tok.value === '==' ? '=' : tok.value === '<>' ? '!=' : tok.value,
          left,
          right,
          span: { start: left.span.start, end: right.span.end },
        };
        continue;
      }

      break;
    }

    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'OP' && ['+', '-', '||'].includes(this.peek().value)) {
      const opTok = this.advance();
      const right = this.parseMultiplicative();
      left = {
        kind: 'binary',
        op: opTok.value,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && ['*', '/', '%'].includes(this.peek().value)) {
      const opTok = this.advance();
      const right = this.parseUnary();
      left = {
        kind: 'binary',
        op: opTok.value,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseUnary(): Expr {
    const tok = this.peek();
    if (tok.type === 'OP' && (tok.value === '-' || tok.value === '+')) {
      this.advance();
      const operand = this.parseUnary();
      return {
        kind: 'unary',
        op: tok.value,
        operand,
        span: { start: tok.start, end: operand.span.end },
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const tok = this.peek();

    // Star *
    if (tok.type === 'OP' && tok.value === '*') {
      this.advance();
      return { kind: 'star', span: { start: tok.start, end: tok.end } };
    }

    // Number literal
    if (tok.type === 'NUMBER') {
      this.advance();
      return {
        kind: 'literal',
        value: Number(tok.value),
        span: { start: tok.start, end: tok.end },
      };
    }

    // String literal
    if (tok.type === 'STRING') {
      this.advance();
      return {
        kind: 'literal',
        value: tok.value,
        span: { start: tok.start, end: tok.end },
      };
    }

    // NULL / TRUE / FALSE
    if (this.matchKeyword('NULL')) {
      return { kind: 'literal', value: null, span: { start: tok.start, end: tok.end } };
    }
    if (this.matchKeyword('TRUE')) {
      return { kind: 'literal', value: 1, span: { start: tok.start, end: tok.end } };
    }
    if (this.matchKeyword('FALSE')) {
      return { kind: 'literal', value: 0, span: { start: tok.start, end: tok.end } };
    }

    // EXISTS (SELECT ...)
    if (this.matchKeyword('EXISTS')) {
      const sub = this.captureParenthesizedSql();
      return {
        kind: 'exists',
        subquerySql: sub.innerSql,
        negated: false,
        span: { start: tok.start, end: sub.end },
      };
    }

    // CASE ... END
    if (this.matchKeyword('CASE')) {
      return this.parseCaseExpr(tok.start);
    }

    // CAST(expr AS type)
    if (this.matchKeyword('CAST')) {
      this.expectPunct('(');
      const expr = this.parseExpr();
      this.expectKeyword('AS');
      const typeTok = this.advance();
      const closeTok = this.expectPunct(')');
      return {
        kind: 'cast',
        expr,
        targetType: typeTok.upper,
        span: { start: tok.start, end: closeTok.end },
      };
    }

    // Parenthesized expression or scalar subquery
    if (tok.type === 'PUNCT' && tok.value === '(') {
      const next = this.peek(1);
      if (next.type === 'KEYWORD' && (next.upper === 'SELECT' || next.upper === 'WITH')) {
        const sub = this.captureParenthesizedSql();
        return {
          kind: 'scalar_subquery',
          subquerySql: sub.innerSql,
          span: { start: sub.start, end: sub.end },
        };
      }
      this.expectPunct('(');
      const inner = this.parseExpr();
      const closeTok = this.expectPunct(')');
      return {
        ...inner,
        span: { start: tok.start, end: closeTok.end },
      };
    }

    // Identifier, table.col, table.*, or function call
    if (tok.type === 'IDENT' || tok.type === 'KEYWORD') {
      this.advance();

      // Function call: name(...)
      if (this.peek().type === 'PUNCT' && this.peek().value === '(') {
        this.expectPunct('(');
        let distinct = false;
        if (this.matchKeyword('DISTINCT')) {
          distinct = true;
        }
        const args: Expr[] = [];
        if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
          do {
            args.push(this.parseExpr());
          } while (this.matchPunct(','));
        }
        const closeTok = this.expectPunct(')');
        return {
          kind: 'function',
          name: tok.upper,
          distinct,
          args,
          span: { start: tok.start, end: closeTok.end },
        };
      }

      // table.col or table.*
      if (this.matchPunct('.')) {
        const nextTok = this.peek();
        if (nextTok.type === 'OP' && nextTok.value === '*') {
          this.advance();
          return {
            kind: 'star',
            table: tok.value,
            span: { start: tok.start, end: nextTok.end },
          };
        }
        const colTok = this.advance();
        return {
          kind: 'column',
          table: tok.value,
          name: colTok.value,
          span: { start: tok.start, end: colTok.end },
        };
      }

      return {
        kind: 'column',
        name: tok.value,
        span: { start: tok.start, end: tok.end },
      };
    }

    throw new Error(`Không thể phân tích biểu thức tại "${tok.value || 'EOF'}"`);
  }

  private parseCaseExpr(start: number): Expr {
    let base: Expr | undefined;
    if (!this.isKeyword('WHEN')) {
      base = this.parseExpr();
    }
    const whens: Array<{ cond: Expr; result: Expr }> = [];
    while (this.matchKeyword('WHEN')) {
      const cond = this.parseExpr();
      this.expectKeyword('THEN');
      const result = this.parseExpr();
      whens.push({ cond, result });
    }
    let elseExpr: Expr | undefined;
    if (this.matchKeyword('ELSE')) {
      elseExpr = this.parseExpr();
    }
    const endTok = this.expectKeyword('END');
    return {
      kind: 'case',
      base,
      whens,
      elseExpr,
      span: { start, end: endTok.end },
    };
  }
}

export function parseSelectSql(sql: string): SelectStatement {
  const parser = new SqlParser(sql);
  return parser.parseStatement();
}
