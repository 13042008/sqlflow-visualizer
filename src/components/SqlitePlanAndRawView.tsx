import { Cpu, Table2 } from 'lucide-react';
import type { QueryPlanRow, SqlValue } from '../types/sql';

interface SqlitePlanAndRawViewProps {
  sqliteResult?: {
    columns: string[];
    rows: SqlValue[][];
  };
  queryPlan: QueryPlanRow[];
  fallbackReason?: string;
}

export function SqlitePlanAndRawView({
  sqliteResult,
  queryPlan,
  fallbackReason,
}: SqlitePlanAndRawViewProps) {
  return (
    <div className="space-y-4">
      {fallbackReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Chế độ SQLite trực tiếp:</strong> {fallbackReason}
        </div>
      )}

      {/* SQLite EXPLAIN QUERY PLAN */}
      {queryPlan.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <Cpu className="h-4 w-4 text-indigo-500" />
            <span>Kế hoạch thực thi của SQLite (EXPLAIN QUERY PLAN)</span>
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            {queryPlan.map((plan) => (
              <div
                key={`${plan.id}-${plan.detail}`}
                style={{ paddingLeft: `${Math.min(plan.parent > 0 ? 18 : 0, 36)}px` }}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-slate-700 shadow-2xs dark:bg-slate-900 dark:text-slate-200"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                <span>{plan.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final SQLite Output Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Table2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Bảng kết quả gốc từ SQLite WASM</span>
          </div>
          {sqliteResult && (
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {sqliteResult.rows.length} dòng × {sqliteResult.columns.length} cột
            </span>
          )}
        </div>

        {!sqliteResult || sqliteResult.columns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Truy vấn trả về 0 cột.
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/60">
                  <th className="w-10 px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    #
                  </th>
                  {sqliteResult.columns.map((col, idx) => (
                    <th
                      key={`${col}-${idx}`}
                      className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sqliteResult.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                      {rIdx + 1}
                    </td>
                    {row.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className={`whitespace-nowrap px-3 py-2 font-mono ${
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
        )}
      </div>
    </div>
  );
}
