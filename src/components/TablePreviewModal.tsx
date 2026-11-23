import { KeyRound, Link2, Play, Table2, X } from 'lucide-react';
import type { SqlValue, TableSchema } from '../types/sql';

interface TablePreviewModalProps {
  tableSchema: TableSchema | null;
  data: { columns: string[]; rows: SqlValue[][] } | null;
  onClose: () => void;
  onQueryTable: (tableName: string) => void;
}

export function TablePreviewModal({
  tableSchema,
  data,
  onClose,
  onQueryTable,
}: TablePreviewModalProps) {
  if (!tableSchema || !data) return null;

  const colMetaMap = new Map(tableSchema.columns.map((c) => [c.name, c]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
              <Table2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {tableSchema.name}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {data.rows.length} dòng • {data.columns.length} cột
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dữ liệu gốc hiện đang lưu trong SQLite WASM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onQueryTable(tableSchema.name);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Truy vấn bảng này</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70">
                  <th className="w-10 px-3 py-2.5 text-center font-mono text-[11px] font-semibold text-slate-400">
                    #
                  </th>
                  {data.columns.map((colName) => {
                    const meta = colMetaMap.get(colName);
                    return (
                      <th
                        key={colName}
                        className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-1.5">
                          {meta?.pk && <KeyRound className="h-3 w-3 text-amber-500" />}
                          {meta?.fk && <Link2 className="h-3 w-3 text-cyan-500" />}
                          <span>{colName}</span>
                          {meta?.type && (
                            <span className="text-[10px] font-normal text-slate-400">
                              {meta.type}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {data.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                      {rIdx + 1}
                    </td>
                    {row.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 font-mono ${
                          typeof val === 'number'
                            ? 'tabular-nums text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {val === null ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] italic text-slate-400 dark:bg-slate-800">
                            NULL
                          </span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
