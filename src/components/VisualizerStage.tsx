import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Columns3,
  Cpu,
  Eye,
  EyeOff,
  Info,
  Layers,
  Lightbulb,
} from 'lucide-react';
import { CLAUSE_STYLES } from '../engine/clauseTheme';
import type { TraceExecutionResult } from '../types/sql';
import { AnimatedDataTable } from './AnimatedDataTable';
import { DmlDiffView } from './DmlDiffView';
import { ExecutionPipeline } from './ExecutionPipeline';
import { GroupBucketView } from './GroupBucketView';
import { JoinVennCard } from './JoinVennCard';
import { SqlitePlanAndRawView } from './SqlitePlanAndRawView';
import { WrittenVsExecutionView } from './WrittenVsExecutionView';

interface VisualizerStageProps {
  result: TraceExecutionResult | null;
  activeStepIndex: number;
  onSelectStep: (idx: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playSpeed: number;
  onChangeSpeed: (speed: number) => void;
}

type StageTab = 'steps' | 'order' | 'sqlite';

export function VisualizerStage({
  result,
  activeStepIndex,
  onSelectStep,
  isPlaying,
  onTogglePlay,
  playSpeed,
  onChangeSpeed,
}: VisualizerStageProps) {
  const [stageTab, setStageTab] = useState<StageTab>('steps');
  const [showFiltered, setShowFiltered] = useState(true);
  const [showDroppedCols, setShowDroppedCols] = useState(false);

  if (!result || result.mode === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Layers className="h-9 w-9 text-indigo-400" />
        <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
          Sẵn sàng trực quan hóa câu lệnh SQL
        </h3>
        <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Chọn một ví dụ ở thanh bên trái hoặc nhập câu lệnh SQL của bạn rồi nhấn{' '}
          <strong className="text-indigo-600 dark:text-indigo-400">Chạy &amp; Trực quan hóa</strong>.
        </p>
      </div>
    );
  }

  if (result.mode === 'dml_diff' && result.dmlDiff) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <DmlDiffView diff={result.dmlDiff} />
      </div>
    );
  }

  if (result.mode === 'select_sqlite_only') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <SqlitePlanAndRawView
          sqliteResult={result.sqliteResult}
          queryPlan={result.queryPlan}
          fallbackReason={result.fallbackReason}
        />
      </div>
    );
  }

  const activeStep =
    result.steps[Math.min(activeStepIndex, Math.max(0, result.steps.length - 1))];
  const style = activeStep ? CLAUSE_STYLES[activeStep.clause] : CLAUSE_STYLES.FROM;

  const hasFilterableRows =
    activeStep &&
    ['WHERE', 'HAVING', 'DISTINCT', 'LIMIT', 'SET_OP'].includes(activeStep.clause) &&
    activeStep.rows.some((r) => r.status !== 'kept' && r.status !== 'unmatched_null');

  const hasDroppedCols =
    activeStep?.clause === 'SELECT' &&
    activeStep.columns.some((c) => c.isSelected === false);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Stage View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStageTab('steps')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              stageTab === 'steps'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Từng bước thực thi ({result.steps.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStageTab('order')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              stageTab === 'order'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>Thứ tự viết ↔ Thực thi</span>
          </button>

          <button
            type="button"
            onClick={() => setStageTab('sqlite')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              stageTab === 'sqlite'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>SQLite &amp; Query Plan</span>
          </button>
        </div>

        {/* Contextual toggles for the active step */}
        {stageTab === 'steps' && (
          <div className="flex items-center gap-2">
            {hasFilterableRows && (
              <button
                type="button"
                onClick={() => setShowFiltered((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showFiltered
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {showFiltered ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showFiltered ? 'Đang hiện dòng bị loại' : 'Hiện dòng bị loại'}</span>
              </button>
            )}

            {hasDroppedCols && (
              <button
                type="button"
                onClick={() => setShowDroppedCols((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showDroppedCols
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <Columns3 className="h-3.5 w-3.5" />
                <span>{showDroppedCols ? 'Đang hiện cột bị ẩn' : 'Hiện cột bị ẩn'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stage Body */}
      <div className="p-4">
        {stageTab === 'order' ? (
          <WrittenVsExecutionView
            writtenOrder={result.writtenOrder}
            steps={result.steps}
            activeStepIndex={activeStepIndex}
            onJumpToStep={(idx) => {
              onSelectStep(idx);
              setStageTab('steps');
            }}
          />
        ) : stageTab === 'sqlite' ? (
          <SqlitePlanAndRawView
            sqliteResult={result.sqliteResult}
            queryPlan={result.queryPlan}
          />
        ) : activeStep ? (
          <div className="space-y-4">
            {/* Pipeline stepper & playback controls */}
            <ExecutionPipeline
              steps={result.steps}
              activeStepIndex={activeStepIndex}
              onSelectStep={onSelectStep}
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
              playSpeed={playSpeed}
              onChangeSpeed={onChangeSpeed}
            />

            {/* Active Step Explanation Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`banner-${activeStep.index}-${activeStep.clause}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className={`relative overflow-hidden rounded-xl border ${style.pillBorder} ${style.pillBg} p-3.5`}
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${style.barBg}`} />
                <div className="pl-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold text-white ${style.barBg}`}
                      >
                        Bước {activeStep.index + 1}: {activeStep.badgeLabel}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {activeStep.title}
                      </h3>
                    </div>

                    {activeStep.sqlSnippet && (
                      <code className="max-w-full truncate rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                        {activeStep.sqlSnippet}
                      </code>
                    )}
                  </div>

                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span>{activeStep.explanation}</span>
                  </p>

                  {activeStep.tip && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>{activeStep.tip}</span>
                    </p>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* JOIN Venn Diagram + Source Comparator */}
            {activeStep.clause === 'JOIN' && activeStep.joinPreview && (
              <JoinVennCard preview={activeStep.joinPreview} />
            )}

            {/* Main Data Visualization Area */}
            {(activeStep.clause === 'GROUP_BY' || activeStep.clause === 'HAVING') &&
            activeStep.groups ? (
              <GroupBucketView
                groups={activeStep.groups}
                columns={activeStep.columns}
                isHavingStep={activeStep.clause === 'HAVING'}
                showFiltered={showFiltered}
              />
            ) : (
              <AnimatedDataTable
                step={activeStep}
                showFiltered={showFiltered}
                showDroppedCols={showDroppedCols}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
