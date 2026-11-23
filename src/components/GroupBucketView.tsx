import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ChevronRight, Layers, XCircle } from 'lucide-react';
import type { ColumnMeta, GroupBucket, SqlValue } from '../types/sql';

interface GroupBucketViewProps {
  groups: GroupBucket[];
  columns: ColumnMeta[];
  isHavingStep: boolean;
  showFiltered: boolean;
}

function formatAggValue(val: SqlValue): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : Number(val.toFixed(2)).toString();
  }
  return String(val);
}

export function GroupBucketView({
  groups,
  columns,
  isHavingStep,
  showFiltered,
}: GroupBucketViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const visibleGroups = showFiltered
    ? groups
    : groups.filter((g) => g.status === 'kept');

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  if (!visibleGroups.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Không có nhóm nào thỏa điều kiện.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {visibleGroups.map((group, idx) => {
        const isFiltered = group.status === 'filtered';
        const isOpen = expandedGroups[group.groupId] ?? visibleGroups.length <= 4;
        const aggEntries = Object.entries(group.aggregates);

        return (
          <motion.div
            key={group.groupId}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: isFiltered ? 0.65 : 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(idx * 0.04, 0.2) }}
            className={`overflow-hidden rounded-xl border transition ${
              isFiltered
                ? 'border-rose-300 bg-rose-50/40 dark:border-rose-900/70 dark:bg-rose-950/20'
                : isHavingStep
                  ? 'border-emerald-300 bg-white shadow-xs dark:border-emerald-800/70 dark:bg-slate-900'
                  : 'border-violet-200 bg-white shadow-xs dark:border-violet-900/60 dark:bg-slate-900'
            }`}
          >
            {/* Group header */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 ${
                isFiltered
                  ? 'bg-rose-100/60 dark:bg-rose-950/40'
                  : isHavingStep
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'bg-violet-50/70 dark:bg-violet-950/30'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.groupId)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <Layers
                  className={`h-4 w-4 shrink-0 ${
                    isFiltered
                      ? 'text-rose-500'
                      : isHavingStep
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-violet-600 dark:text-violet-400'
                  }`}
                />
                <span
                  className={`truncate text-sm font-bold ${
                    isFiltered
                      ? 'text-rose-800 line-through dark:text-rose-300'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {group.keyLabel}
                </span>
                <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 shadow-2xs dark:bg-slate-800 dark:text-slate-300">
                  {group.memberRows.length} dòng
                </span>
              </button>

              {isHavingStep && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    isFiltered
                      ? 'bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200'
                  }`}
                >
                  {isFiltered ? (
                    <>
                      <XCircle className="h-3 w-3" />
                      LOẠI
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      ĐẠT
                    </>
                  )}
                </span>
              )}
            </div>

            {/* HAVING evaluation detail */}
            {isHavingStep && group.evaluation && (
              <div
                className={`border-t px-3.5 py-1.5 font-mono text-[11.5px] ${
                  isFiltered
                    ? 'border-rose-200/80 bg-rose-50/70 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
                    : 'border-emerald-200/70 bg-emerald-50/40 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                }`}
              >
                {group.evaluation.substituted}{' '}
                <span className="font-bold">
                  → {group.evaluation.result ? 'TRUE' : 'FALSE'}
                </span>
              </div>
            )}

            {/* Aggregate summary chips */}
            {aggEntries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3.5 py-2 dark:border-slate-800">
                {aggEntries.map(([aggName, aggVal]) => (
                  <span
                    key={aggName}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200/80 bg-violet-50/60 px-2 py-0.5 font-mono text-[11px] text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200"
                  >
                    <span className="text-violet-500 dark:text-violet-400">{aggName}</span>
                    <span>=</span>
                    <strong className="tabular-nums">{formatAggValue(aggVal)}</strong>
                  </span>
                ))}
              </div>
            )}

            {/* Constituent member rows */}
            {isOpen && (
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-[11.5px]">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-950/50">
                      {columns.map((col) => (
                        <th
                          key={col.id}
                          className={`whitespace-nowrap px-2.5 py-1.5 font-mono text-[10.5px] font-semibold ${
                            col.isGroupKey
                              ? 'text-violet-700 dark:text-violet-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {col.tableAlias ? `${col.tableAlias}.${col.name}` : col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {group.memberRows.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          isFiltered
                            ? 'text-slate-400 line-through'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }
                      >
                        {columns.map((col) => {
                          const val = row.cells[col.id];
                          return (
                            <td
                              key={col.id}
                              className={`whitespace-nowrap px-2.5 py-1.5 font-mono ${
                                col.isGroupKey
                                  ? 'font-semibold text-violet-700 dark:text-violet-300'
                                  : typeof val === 'number'
                                    ? 'tabular-nums text-slate-700 dark:text-slate-200'
                                    : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {val === null || val === undefined ? (
                                <span className="italic text-slate-400">NULL</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
