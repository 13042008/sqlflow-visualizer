import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
} from 'lucide-react';
import { CLAUSE_STYLES } from '../engine/clauseTheme';
import type { ExecutionStep } from '../types/sql';

interface ExecutionPipelineProps {
  steps: ExecutionStep[];
  activeStepIndex: number;
  onSelectStep: (idx: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playSpeed: number;
  onChangeSpeed: (speed: number) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.5, 2];

export function ExecutionPipeline({
  steps,
  activeStepIndex,
  onSelectStep,
  isPlaying,
  onTogglePlay,
  playSpeed,
  onChangeSpeed,
}: ExecutionPipelineProps) {
  const stepBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const activeBtn = stepBtnRefs.current[activeStepIndex];
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeStepIndex, steps.length]);

  if (!steps.length) return null;

  const isFirst = activeStepIndex <= 0;
  const isLast = activeStepIndex >= steps.length - 1;

  return (
    <div className="space-y-3">
      {/* Horizontal pipeline steps */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
        {steps.map((step, idx) => {
          const style = CLAUSE_STYLES[step.clause];
          const isActive = idx === activeStepIndex;
          const isCompleted = idx < activeStepIndex;

          return (
            <div key={`${step.clause}-${idx}`} className="flex shrink-0 items-center gap-1.5">
              <button
                ref={(el) => {
                  stepBtnRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => onSelectStep(idx)}
                className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                  isActive
                    ? `${style.pillBg} ${style.activeRing} shadow-xs`
                    : isCompleted
                      ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                      : 'border-slate-200/80 bg-slate-50/70 opacity-75 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900/50'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeStepIndicator"
                    className={`absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full ${style.barBg}`}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}

                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                    isActive
                      ? `${style.barBg} text-white`
                      : isCompleted
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                        : 'bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {idx + 1}
                </span>

                <div className="leading-tight">
                  <div
                    className={`font-mono text-xs font-bold ${
                      isActive ? style.pillText : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {step.badgeLabel}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                    {step.inputCount !== step.outputCount ? (
                      <span>
                        {step.inputCount} →{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {step.outputCount}
                        </strong>{' '}
                        {step.unit}
                      </span>
                    ) : (
                      <span>
                        {step.outputCount} {step.unit}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {idx < steps.length - 1 && (
                <ArrowRight
                  className={`h-3.5 w-3.5 shrink-0 ${
                    idx < activeStepIndex
                      ? 'text-indigo-400 dark:text-indigo-500'
                      : 'text-slate-300 dark:text-slate-700'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Playback controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onSelectStep(0)}
            title="Bước đầu tiên"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onSelectStep(activeStepIndex - 1)}
            title="Bước trước (Phím ←)"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Trước</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title="Phát / Tạm dừng tự động (Phím Space)"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white shadow-xs transition ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5 fill-current" />
                <span>Tạm dừng</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{isLast ? 'Phát lại' : 'Tự động'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isLast}
            onClick={() => onSelectStep(activeStepIndex + 1)}
            title="Bước tiếp theo (Phím →)"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="hidden sm:inline">Tiếp</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onSelectStep(steps.length - 1)}
            title="Bước cuối cùng"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Bước{' '}
            <strong className="font-mono text-slate-800 dark:text-slate-100">
              {activeStepIndex + 1}
            </strong>{' '}
            / {steps.length}
          </span>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {SPEED_OPTIONS.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => onChangeSpeed(sp)}
                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold transition ${
                  playSpeed === sp
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {sp}x
              </button>
            ))}
          </div>

          <span className="hidden text-[11px] text-slate-400 lg:inline">
            Phím tắt: <kbd className="rounded border border-slate-300 px-1 font-mono dark:border-slate-700">←</kbd>{' '}
            <kbd className="rounded border border-slate-300 px-1 font-mono dark:border-slate-700">→</kbd>{' '}
            <kbd className="rounded border border-slate-300 px-1 font-mono dark:border-slate-700">Space</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
