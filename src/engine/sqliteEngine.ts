import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type {
  QueryPlanRow,
  SampleDataset,
  SqlValue,
  TableColumnSchema,
  TableSchema,
} from '../types/sql';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    sqlJsPromise = initSqlJs(
      isBrowser
        ? {
            locateFile: () => wasmUrl,
            useOldExtensionFunctions: false,
          }
        : undefined
    );
  }
  return sqlJsPromise;
}

export class SqliteEngine {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;

  async init(): Promise<void> {
    if (!this.SQL) {
      this.SQL = await getSqlJs();
    }
    if (!this.db) {
      this.db = new this.SQL.Database();
      this.db.run('PRAGMA foreign_keys = ON;');
    }
  }

  async loadDataset(dataset: SampleDataset): Promise<void> {
    await this.init();
    if (!this.SQL) throw new Error('SQLite chưa được khởi tạo.');
    if (this.db) {
      this.db.close();
    }
    this.db = new this.SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.run(dataset.schemaSql);
    this.db.run(dataset.seedSql);
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('Cơ sở dữ liệu SQLite chưa sẵn sàng.');
    }
    return this.db;
  }

  getSchema(): TableSchema[] {
    const db = this.ensureDb();
    const tablesRes = db.exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid;`
    );
    if (!tablesRes.length) return [];

    const tableNames = tablesRes[0].values.map((row) => String(row[0]));
    return tableNames.map((tableName) => {
      const escaped = tableName.replace(/"/g, '""');
      const colRes = db.exec(`PRAGMA table_info("${escaped}");`);
      const fkRes = db.exec(`PRAGMA foreign_key_list("${escaped}");`);
      const countRes = db.exec(`SELECT COUNT(*) FROM "${escaped}";`);

      const fkMap = new Map<string, { table: string; column: string }>();
      if (fkRes.length) {
        for (const fkRow of fkRes[0].values) {
          // columns: id, seq, table, from, to, on_update, on_delete, match
          const targetTable = String(fkRow[2]);
          const fromCol = String(fkRow[3]);
          const toCol = String(fkRow[4]);
          fkMap.set(fromCol, { table: targetTable, column: toCol });
        }
      }

      const columns: TableColumnSchema[] = colRes.length
        ? colRes[0].values.map((colRow) => {
            // cid, name, type, notnull, dflt_value, pk
            const name = String(colRow[1]);
            const type = String(colRow[2] || 'TEXT').toUpperCase();
            const notnull = Number(colRow[3]) === 1;
            const pk = Number(colRow[5]) > 0;
            return {
              name,
              type,
              pk,
              notnull,
              fk: fkMap.get(name),
            };
          })
        : [];

      const rowCount = countRes.length ? Number(countRes[0].values[0][0]) : 0;

      return {
        name: tableName,
        columns,
        rowCount,
      };
    });
  }

  getTableData(tableName: string): { columns: string[]; rows: SqlValue[][] } {
    const db = this.ensureDb();
    const escaped = tableName.replace(/"/g, '""');
    const res = db.exec(`SELECT * FROM "${escaped}";`);
    if (!res.length) {
      const info = db.exec(`PRAGMA table_info("${escaped}");`);
      const cols = info.length ? info[0].values.map((r) => String(r[1])) : [];
      return { columns: cols, rows: [] };
    }
    return {
      columns: res[0].columns,
      rows: res[0].values as SqlValue[][],
    };
  }

  execQuery(sql: string): { columns: string[]; rows: SqlValue[][] } {
    const db = this.ensureDb();
    const results = db.exec(sql);
    if (!results.length) {
      return { columns: [], rows: [] };
    }
    const last = results[results.length - 1];
    return {
      columns: last.columns,
      rows: last.values as SqlValue[][],
    };
  }

  runStatement(sql: string): void {
    const db = this.ensureDb();
    db.run(sql);
  }

  explainQueryPlan(sql: string): QueryPlanRow[] {
    const db = this.ensureDb();
    try {
      const cleaned = sql.trim().replace(/;+$/, '');
      const res = db.exec(`EXPLAIN QUERY PLAN ${cleaned}`);
      if (!res.length) return [];
      return res[0].values.map((r) => ({
        id: Number(r[0]),
        parent: Number(r[1]),
        notused: Number(r[2]),
        detail: String(r[3]),
      }));
    } catch {
      return [];
    }
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export function translateSqliteError(rawMessage: string): { error: string; hint?: string } {
  const msg = rawMessage.trim();
  const noTable = msg.match(/no such table:\s*(.+)/i);
  if (noTable) {
    return {
      error: `Không tìm thấy bảng "${noTable[1]}".`,
      hint: 'Kiểm tra lại tên bảng trong thanh Lược đồ CSDL bên trái (chú ý chính tả số ít/số nhiều).',
    };
  }

  const noCol = msg.match(/no such column:\s*(.+)/i);
  if (noCol) {
    return {
      error: `Không tìm thấy cột "${noCol[1]}".`,
      hint: 'Kiểm tra tên cột hoặc bí danh bảng (alias) trong mệnh đề FROM / JOIN.',
    };
  }

  const ambiguous = msg.match(/ambiguous column name:\s*(.+)/i);
  if (ambiguous) {
    return {
      error: `Tên cột "${ambiguous[1]}" bị trùng lặp giữa nhiều bảng.`,
      hint: `Hãy chỉ rõ bảng sở hữu, ví dụ: s.${ambiguous[1]} thay vì chỉ viết ${ambiguous[1]}.`,
    };
  }

  const syntaxNear = msg.match(/near\s+"(.+)":\s*syntax error/i);
  if (syntaxNear) {
    return {
      error: `Lỗi cú pháp SQL gần "${syntaxNear[1]}".`,
      hint: 'Kiểm tra dấu phẩy thừa/thiếu, dấu ngoặc đơn, hoặc thứ tự các mệnh đề (SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT).',
    };
  }

  const fkErr = /FOREIGN KEY constraint failed/i.test(msg);
  if (fkErr) {
    return {
      error: 'Vi phạm ràng buộc khóa ngoại (FOREIGN KEY).',
      hint: 'Giá trị tham chiếu không tồn tại ở bảng cha, hoặc bản ghi đang được bảng con tham chiếu.',
    };
  }

  const uniqueErr = msg.match(/UNIQUE constraint failed:\s*(.+)/i);
  if (uniqueErr) {
    return {
      error: `Vi phạm ràng buộc duy nhất (UNIQUE / PRIMARY KEY) tại ${uniqueErr[1]}.`,
      hint: 'Giá trị khóa chính hoặc cột duy nhất này đã tồn tại trong bảng.',
    };
  }

  return {
    error: `Lỗi SQLite: ${msg}`,
    hint: 'Kiểm tra lại cú pháp câu lệnh SQL và các tên bảng/cột hiện có.',
  };
}
