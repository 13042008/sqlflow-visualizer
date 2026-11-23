import { ArrowRight, Sparkles } from 'lucide-react';
import { CLAUSE_STYLES } from '../engine/clauseTheme';
import type { ExecutionStep, WrittenClauseOrderItem } from '../types/sql';

interface WrittenVsExecutionViewProps {
  writtenOrder: WrittenClauseOrderItem[];
  steps: ExecutionStep[];
  activeStepIndex: number;
  onJumpToStep: (stepIdx: number) => void;
}

export function WrittenVsExecutionView({
  writtenOrder,
  steps,
  activeStepIndex,
  onJumpToStep,
}: WrittenVsExecutionViewProps) {
  if (!writtenOrder.length || !steps.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Chạy một câu lệnh SELECT để so sánh thứ tự viết SQL và thứ tự thực thi thực tế.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <p className="leading-relaxed">
          <strong>Tại sao hiểu thứ tự thực thi lại quan trọng?</strong> Bạn viết{' '}
          <code className="rounded bg-white/80 px-1 py-0.5 font-semibold dark:bg-slate-900">
            SELECT
          </code>{' '}
          đầu tiên, nhưng SQL chỉ chạy nó <em>sau khi</em> đã đọc{' '}
          <code className="rounded bg-white/80 px-1 py-0.5 font-semibold dark:bg-slate-900">
            FROM / JOIN / WHERE / GROUP BY / HAVING
          </code>
          . Đó là lý do bí danh (<code className="font-semibold">AS ...</code>) trong{' '}
          <code className="font-semibold">SELECT</code> dùng được ở{' '}
          <code className="font-semibold">ORDER BY</code> nhưng không dùng được ở{' '}
          <code className="font-semibold">WHERE</code>!
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left: Written Order */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1. Thứ tự bạn viết (Cú pháp SQL)
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800">
              Trên → Dưới
            </span>
          </div>
          <div className="space-y-2">
            {writtenOrder.map((item) => {
              const style = CLAUSE_STYLES[item.clause];
              const isCurrent = item.executionOrder - 1 === activeStepIndex;
              return (
                <button
                  key={`${item.clause}-${item.writtenOrder}`}
                  type="button"
                  onClick={() => onJumpToStep(item.executionOrder - 1)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition ${
                    isCurrent
                      ? `${style.pillBg} ${style.activeRing}`
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {item.writtenOrder}
                    </span>
                    <div className="min-w-0">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${style.pillBg} ${style.pillText}`}
                      >
                        {item.label}
                      </span>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {item.sqlSnippet}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    <ArrowRight className="h-3 w-3" />
                    Bước #{item.executionOrder}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Logical Execution Order */}
        <div className="rounded-xl border border-indigo-200/80 bg-white p-4 dark:border-indigo-900/50 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              2. Thứ tự SQL thực thi thực tế
            </h3>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Nhấp để xem bước
            </span>
          </div>
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const style = CLAUSE_STYLES[step.clause];
              const isCurrent = idx === activeStepIndex;
              return (
                <button
                  key={`${step.clause}-${idx}`}
                  type="button"
                  onClick={() => onJumpToStep(idx)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition ${
                    isCurrent
                      ? `${style.pillBg} ${style.activeRing}`
                      : 'border-slate-200 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-700'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-white ${style.barBg}`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-xs font-bold ${style.pillText}`}>
                          {step.badgeLabel}
                        </span>
                        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                          {step.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {style.summary}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {step.outputCount} {step.unit}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
