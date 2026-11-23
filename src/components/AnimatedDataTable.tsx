import { Fragment, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CopyX,
  FlaskConical,
  Scissors,
  XCircle,
} from 'lucide-react';
import { getTableOriginColor } from '../engine/clauseTheme';
import type { ColumnMeta, ExecutionStep, SqlValue, TracedRow } from '../types/sql';

interface AnimatedDataTableProps {
  step: ExecutionStep;
  showFiltered: boolean;
  showDroppedCols: boolean;
}

function formatCellValue(val: SqlValue): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : String(Number(val.toFixed(4)));
  }
  return String(val);
}

export function AnimatedDataTable({
  step,
  showFiltered,
  showDroppedCols,
}: AnimatedDataTableProps) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const visibleColumns: ColumnMeta[] =
    step.clause === 'SELECT' && !showDroppedCols
      ? step.columns.filter((c) => c.isSelected !== false)
      : step.columns;

  const visibleRows: TracedRow[] = showFiltered
    ? step.rows
    : step.rows.filter((r) => r.status === 'kept' || r.status === 'unmatched_null');

  const isWhere = step.clause === 'WHERE';
  const isOrder = step.clause === 'ORDER_BY';
  const isLimit = step.clause === 'LIMIT';
  const isDistinct = step.clause === 'DISTINCT' || step.clause === 'SET_OP';
  const isJoinOrFrom = step.clause === 'JOIN' || step.clause === 'FROM';

  const inspectedRow =
    visibleRows.find((r) => r.id === selectedRowId) ??
    (isWhere ? visibleRows.find((r) => r.status === 'filtered') ?? visibleRows[0] : null);

  if (!visibleColumns.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Không có cột dữ liệu để hiển thị ở bước này.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table provenance legend on JOIN */}
      {step.clause === 'JOIN' && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Nguồn cột:</span>
          {Array.from(
            new Map(
              visibleColumns
                .filter((c) => c.tableAlias)
                .map((c) => [c.sourceIndex, c.tableAlias!])
            ).entries()
          ).map(([srcIdx, alias]) => {
            const color = getTableOriginColor(srcIdx);
            return (
              <span
                key={srcIdx}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono font-semibold ${color.badge}`}
              >
                <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                {alias}
              </span>
            );
          })}
        </div>
      )}

      {/* Main animated table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="max-h-[430px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-950/95">
                {/* Left gutter column */}
                <th className="w-14 whitespace-nowrap px-3 py-2.5 text-center font-mono text-[11px] font-semibold text-slate-400">
                  {isOrder ? 'Hạng' : isWhere || isDistinct ? 'Trạng thái' : '#'}
                </th>

                {visibleColumns.map((col) => {
                  const originColor = getTableOriginColor(col.sourceIndex);
                  const isDropped = step.clause === 'SELECT' && col.isSelected === false;

                  return (
                    <th
                      key={col.id}
                      className={`whitespace-nowrap px-3 py-2.5 font-mono text-xs transition ${
                        isDropped
                          ? 'bg-slate-100/80 text-slate-400 opacity-55 dark:bg-slate-900/80 dark:text-slate-500'
                          : col.isSortKey
                            ? 'border-t-2 border-t-sky-500 bg-sky-50/80 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200'
                            : isJoinOrFrom
                              ? `border-t-2 ${originColor.borderTop} ${originColor.headerBg} text-slate-800 dark:text-slate-100`
                              : col.isComputed
                                ? 'border-t-2 border-t-emerald-500 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isJoinOrFrom && col.tableAlias && (
                          <span
                            className={`rounded px-1 py-0.5 text-[10px] font-bold ${originColor.badge}`}
                          >
                            {col.tableAlias}
                          </span>
                        )}

                        <span className={isDropped ? 'line-through' : 'font-semibold'}>
                          {col.name}
                        </span>

                        {col.isComputed && step.clause === 'SELECT' && (
                          <span
                            title={col.expression}
                            className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[9.5px] font-bold text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300"
                          >
                            <FlaskConical className="h-2.5 w-2.5" />
                            fx
                          </span>
                        )}

                        {isDropped && (
                          <span className="rounded bg-slate-200 px-1 py-0.5 font-sans text-[9.5px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Ẩn
                          </span>
                        )}

                        {col.isSortKey && col.sortDirection && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-sky-600 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                            {col.sortDirection === 'ASC' ? (
                              <>
                                <ArrowUp className="h-2.5 w-2.5" />
                                ASC
                              </>
                            ) : (
                              <>
                                <ArrowDown className="h-2.5 w-2.5" />
                                DESC
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      {col.expression && step.clause === 'SELECT' && !isDropped && (
                        <div className="mt-0.5 max-w-[180px] truncate text-[10px] font-normal text-slate-400 dark:text-slate-500">
                          {col.expression}
                        </div>
                      )}
                    </th>
                  );
                })}

                {isWhere && (
                  <th className="whitespace-nowrap px-3 py-2.5 text-right font-sans text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Đánh giá WHERE
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + (isWhere ? 2 : 1)}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Không có dòng dữ liệu nào được giữ lại ở bước này.
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {visibleRows.map((row, rowIdx) => {
                    const prevRow = rowIdx > 0 ? visibleRows[rowIdx - 1] : null;
                    const showOffsetDivider =
                      isLimit &&
                      showFiltered &&
                      prevRow?.status === 'skipped_offset' &&
                      row.status === 'kept';
                    const showLimitDivider =
                      isLimit &&
                      showFiltered &&
                      prevRow?.status === 'kept' &&
                      row.status === 'truncated_limit';

                    const isFiltered = row.status === 'filtered';
                    const isUnmatchedNull = row.status === 'unmatched_null';
                    const isDup = row.status === 'duplicate';
                    const isCut =
                      row.status === 'skipped_offset' || row.status === 'truncated_limit';
                    const isSelected = inspectedRow?.id === row.id && isWhere;

                    const rankDelta =
                      isOrder && row.prevRank && row.newRank
                        ? row.prevRank - row.newRank
                        : 0;

                    return (
                      <Fragment key={row.id}>
                        {showOffsetDivider && (
                          <tr className="bg-purple-50/80 dark:bg-purple-950/40">
                            <td
                              colSpan={visibleColumns.length + 1}
                              className="border-y border-dashed border-purple-300 px-3 py-1.5 text-center font-mono text-[11px] font-semibold text-purple-700 dark:border-purple-700 dark:text-purple-300"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Scissors className="h-3.5 w-3.5" />
                                Bỏ qua OFFSET {step.limitInfo?.offset} dòng phía trên — bắt đầu lấy kết quả từ đây
                              </span>
                            </td>
                          </tr>
                        )}

                        {showLimitDivider && (
                          <tr className="bg-purple-50/80 dark:bg-purple-950/40">
                            <td
                              colSpan={visibleColumns.length + 1}
                              className="border-y border-dashed border-purple-300 px-3 py-1.5 text-center font-mono text-[11px] font-semibold text-purple-700 dark:border-purple-700 dark:text-purple-300"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Scissors className="h-3.5 w-3.5" />
                                Đã đủ LIMIT {step.limitInfo?.limit} dòng — các dòng phía dưới bị cắt bỏ
                              </span>
                            </td>
                          </tr>
                        )}

                        <motion.tr
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{
                            opacity: isFiltered || isDup || isCut ? 0.52 : 1,
                            y: 0,
                          }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{
                            layout: { type: 'spring', stiffness: 360, damping: 30 },
                            opacity: { duration: 0.18 },
                          }}
                          onClick={() => isWhere && setSelectedRowId(row.id)}
                          className={`transition-colors ${
                            isWhere ? 'cursor-pointer' : ''
                          } ${
                            isSelected
                              ? 'bg-amber-50/80 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-700'
                              : isFiltered
                                ? 'bg-rose-50/45 hover:bg-rose-50/80 dark:bg-rose-950/20 dark:hover:bg-rose-950/35'
                                : isDup
                                  ? 'bg-orange-50/45 dark:bg-orange-950/20'
                                  : isCut
                                    ? 'bg-slate-50/90 dark:bg-slate-950/60'
                                    : isUnmatchedNull
                                      ? 'bg-cyan-50/55 dark:bg-cyan-950/25'
                                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Gutter cell */}
                          <td className="whitespace-nowrap px-3 py-2 text-center font-mono text-[11px]">
                            {isOrder && row.newRank ? (
                              <div className="inline-flex items-center gap-1">
                                <span className="font-bold text-slate-700 dark:text-slate-200">
                                  #{row.newRank}
                                </span>
                                {rankDelta !== 0 && (
                                  <span
                                    title={`Trước sắp xếp ở hàng #${row.prevRank}`}
                                    className={`rounded px-1 py-0.2 text-[9.5px] font-bold ${
                                      rankDelta > 0
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                    }`}
                                  >
                                    {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
                                  </span>
                                )}
                              </div>
                            ) : isWhere ? (
                              isFiltered ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                  <XCircle className="h-3 w-3" />
                                  LOẠI
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  GIỮ
                                </span>
                              )
                            ) : isDistinct && isDup ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                                <CopyX className="h-3 w-3" />
                                TRÙNG
                              </span>
                            ) : isLimit && isCut ? (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9.5px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                {row.status === 'skipped_offset' ? 'BỎ' : 'CẮT'}
                              </span>
                            ) : (
                              <span className="text-slate-400">{rowIdx + 1}</span>
                            )}
                          </td>

                          {/* Data cells */}
                          {visibleColumns.map((col) => {
                            const val = row.cells[col.id];
                            const isNull = val === null || val === undefined;
                            const isDropped =
                              step.clause === 'SELECT' && col.isSelected === false;

                            return (
                              <td
                                key={col.id}
                                className={`whitespace-nowrap px-3 py-2 font-mono text-[12px] ${
                                  isDropped
                                    ? 'bg-slate-50/70 text-slate-400 opacity-45 dark:bg-slate-950/40 dark:text-slate-500'
                                    : isFiltered || isDup || isCut
                                      ? 'text-slate-500 line-through dark:text-slate-400'
                                      : col.isSortKey
                                        ? 'bg-sky-50/40 font-semibold text-sky-900 dark:bg-sky-950/20 dark:text-sky-200'
                                        : typeof val === 'number'
                                          ? 'tabular-nums text-indigo-700 dark:text-indigo-300'
                                          : 'text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {isNull ? (
                                  <span
                                    className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] italic ${
                                      isUnmatchedNull
                                        ? 'bg-cyan-100 font-semibold text-cyan-800 dark:bg-cyan-900/70 dark:text-cyan-200'
                                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                    }`}
                                  >
                                    NULL
                                  </span>
                                ) : (
                                  formatCellValue(val)
                                )}
                              </td>
                            );
                          })}

                          {/* Inline WHERE evaluation column */}
                          {isWhere && row.evaluation && (
                            <td className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 text-right font-mono text-[11px]">
                              <span
                                title={`${row.evaluation.substituted} → ${
                                  row.evaluation.result === null
                                    ? 'NULL'
                                    : row.evaluation.result
                                      ? 'TRUE'
                                      : 'FALSE'
                                }`}
                                className={
                                  isFiltered
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }
                              >
                                {row.evaluation.substituted} →{' '}
                                <strong>
                                  {row.evaluation.result === null
                                    ? 'NULL'
                                    : row.evaluation.result
                                      ? 'TRUE'
                                      : 'FALSE'}
                                </strong>
                              </span>
                            </td>
                          )}
                        </motion.tr>
                      </Fragment>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected WHERE row formula breakdown */}
      {isWhere && inspectedRow?.evaluation && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Chi tiết kiểm tra điều kiện WHERE cho dòng đang chọn
            </div>
            <div className="font-mono text-xs text-slate-800 dark:text-slate-100">
              {inspectedRow.evaluation.substituted}{' '}
              <span
                className={`ml-1 rounded px-1.5 py-0.5 font-bold ${
                  inspectedRow.evaluation.result
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                }`}
              >
                →{' '}
                {inspectedRow.evaluation.result === null
                  ? 'NULL (Loại)'
                  : inspectedRow.evaluation.result
                    ? 'TRUE (Giữ lại)'
                    : 'FALSE (Loại bỏ)'}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
            Nhấp vào bất kỳ dòng nào trong bảng để soi điều kiện
          </span>
        </div>
      )}
    </div>
  );
}
