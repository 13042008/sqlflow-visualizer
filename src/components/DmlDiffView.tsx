import { CheckCircle2, Minus, Pencil, Plus } from 'lucide-react';
import type { DmlDiffResult, SqlValue } from '../types/sql';

interface DmlDiffViewProps {
  diff: DmlDiffResult;
}

function fmt(val: SqlValue | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

export function DmlDiffView({ diff }: DmlDiffViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Thay đổi dữ liệu ({diff.statementType})
            </div>
            <p className="text-xs text-emerald-900 dark:text-emerald-200">{diff.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] font-semibold">
          {diff.addedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200/80 px-2 py-0.5 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
              <Plus className="h-3 w-3" /> {diff.addedCount} thêm
            </span>
          )}
          {diff.updatedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
              <Pencil className="h-3 w-3" /> {diff.updatedCount} sửa
            </span>
          )}
          {diff.deletedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-200/80 px-2 py-0.5 text-rose-900 dark:bg-rose-900 dark:text-rose-200">
              <Minus className="h-3 w-3" /> {diff.deletedCount} xóa
            </span>
          )}
        </div>
      </div>

      {diff.columns.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70">
                  <th className="w-16 px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    Diff
                  </th>
                  {diff.columns.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {diff.diffRows.map((row, idx) => {
                  const isAdded = row.status === 'added';
                  const isRemoved = row.status === 'removed';
                  const isUpdated = row.status === 'updated';
                  const record = row.after ?? row.before ?? {};

                  return (
                    <tr
                      key={idx}
                      className={
                        isAdded
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                          : isRemoved
                            ? 'bg-rose-50/70 opacity-70 dark:bg-rose-950/30'
                            : isUpdated
                              ? 'bg-amber-50/60 dark:bg-amber-950/25'
                              : ''
                      }
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] font-bold">
                        {isAdded && (
                          <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                            + MỚI
                          </span>
                        )}
                        {isRemoved && (
                          <span className="rounded bg-rose-200 px-1.5 py-0.5 text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                            − XÓA
                          </span>
                        )}
                        {isUpdated && (
                          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            ~ SỬA
                          </span>
                        )}
                        {row.status === 'unchanged' && (
                          <span className="text-slate-400">•</span>
                        )}
                      </td>
                      {diff.columns.map((col) => {
                        const changed = isUpdated && row.changedColumns?.includes(col);
                        return (
                          <td
                            key={col}
                            className={`whitespace-nowrap px-3 py-2 font-mono ${
                              isRemoved
                                ? 'text-rose-700 line-through dark:text-rose-300'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {changed ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-rose-500 line-through">
                                  {fmt(row.before?.[col])}
                                </span>
                                <span className="text-slate-400">→</span>
                                <span className="rounded bg-amber-100 px-1 font-bold text-amber-900 dark:bg-amber-900/70 dark:text-amber-200">
                                  {fmt(row.after?.[col])}
                                </span>
                              </span>
                            ) : (
                              fmt(record[col])
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
