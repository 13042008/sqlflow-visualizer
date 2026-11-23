import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Header } from './components/Header';
import { SchemaSidebar } from './components/SchemaSidebar';
import { SqlEditor } from './components/SqlEditor';
import { TablePreviewModal } from './components/TablePreviewModal';
import { VisualizerStage } from './components/VisualizerStage';
import { SAMPLE_DATASETS } from './data/datasets';
import { SqliteEngine } from './engine/sqliteEngine';
import { executeAndTraceSql } from './engine/tracer';
import type {
  DatasetPresetQuery,
  SqlValue,
  TableSchema,
  TraceExecutionResult,
} from './types/sql';

export function App() {
  const engineRef = useRef<SqliteEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [activeDatasetId, setActiveDatasetId] = useState<string>(SAMPLE_DATASETS[0].id);
  const activeDataset = useMemo(
    () => SAMPLE_DATASETS.find((d) => d.id === activeDatasetId) ?? SAMPLE_DATASETS[0],
    [activeDatasetId]
  );

  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [sqlText, setSqlText] = useState<string>(SAMPLE_DATASETS[0].presets[0].sql);
  const [activePresetId, setActivePresetId] = useState<string | null>(
    SAMPLE_DATASETS[0].presets[0].id
  );

  const [traceResult, setTraceResult] = useState<TraceExecutionResult | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sqlflow-theme') === 'dark';
  });

  const [previewTableName, setPreviewTableName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    columns: string[];
    rows: SqlValue[][];
  } | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  // Sync dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('sqlflow-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Run SQL against SQLite WASM & tracer
  const runSql = useCallback((queryToRun: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
    const res = executeAndTraceSql(engine, queryToRun);
    setTraceResult(res);
    setActiveStepIndex(0);
    if (res.mode === 'dml_diff') {
      setSchema(engine.getSchema());
    }
  }, []);

  // Initialize SQLite WASM and load initial dataset
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const engine = new SqliteEngine();
        await engine.loadDataset(SAMPLE_DATASETS[0]);
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        setSchema(engine.getSchema());
        setEngineReady(true);

        const initialSql = SAMPLE_DATASETS[0].presets[0].sql;
        const initialResult = executeAndTraceSql(engine, initialSql);
        setTraceResult(initialResult);
        setActiveStepIndex(0);
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err instanceof Error
              ? err.message
              : 'Không thể khởi tạo SQLite WebAssembly trong trình duyệt.'
          );
        }
      }
    };
    init();

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Switch dataset
  const handleSelectDataset = useCallback(
    async (datasetId: string) => {
      const ds = SAMPLE_DATASETS.find((d) => d.id === datasetId);
      const engine = engineRef.current;
      if (!ds || !engine) return;

      setIsPlaying(false);
      await engine.loadDataset(ds);
      setActiveDatasetId(ds.id);
      setSchema(engine.getSchema());

      const firstPreset = ds.presets[0];
      setSqlText(firstPreset.sql);
      setActivePresetId(firstPreset.id);
      const res = executeAndTraceSql(engine, firstPreset.sql);
      setTraceResult(res);
      setActiveStepIndex(0);
      showToast(`Đã chuyển sang bộ dữ liệu "${ds.name}"`);
    },
    [showToast]
  );

  // Reset active dataset
  const handleResetDb = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
    await engine.loadDataset(activeDataset);
    setSchema(engine.getSchema());
    runSql(sqlText);
    showToast(`Đã khôi phục dữ liệu gốc của "${activeDataset.name}"`);
  }, [activeDataset, runSql, showToast, sqlText]);

  // Select a curated preset query
  const handleSelectPreset = useCallback(
    (preset: DatasetPresetQuery) => {
      setSqlText(preset.sql);
      setActivePresetId(preset.id);
      runSql(preset.sql);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    },
    [runSql]
  );

  // Preview table data
  const handlePreviewTable = useCallback((tableName: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const data = engine.getTableData(tableName);
      setPreviewTableName(tableName);
      setPreviewData(data);
    } catch {
      // ignore
    }
  }, []);

  const handleQueryTable = useCallback(
    (tableName: string) => {
      const q = `SELECT *\nFROM ${tableName};`;
      setSqlText(q);
      setActivePresetId(null);
      runSql(q);
    },
    [runSql]
  );

  const handleInsertIdentifier = useCallback((ident: string) => {
    setSqlText((prev) => {
      const needsSpace = prev.length > 0 && !/[\s,(.]/.test(prev[prev.length - 1]);
      return `${prev}${needsSpace ? ' ' : ''}${ident}`;
    });
    setActivePresetId(null);
  }, []);

  // Auto-play stepping timer
  const totalSteps = traceResult?.steps.length ?? 0;

  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;
    const delayMs = Math.round(1800 / playSpeed);
    const timer = window.setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playSpeed, totalSteps]);

  const handleTogglePlay = useCallback(() => {
    if (totalSteps <= 1) return;
    setIsPlaying((prev) => {
      if (!prev && activeStepIndex >= totalSteps - 1) {
        setActiveStepIndex(0);
      }
      return !prev;
    });
  }, [activeStepIndex, totalSteps]);

  const handleSelectStep = useCallback((idx: number) => {
    setIsPlaying(false);
    setActiveStepIndex(idx);
  }, []);

  // Global keyboard shortcuts when not typing in editor/inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.cm-editor'))
      ) {
        return;
      }
      if (!totalSteps) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setActiveStepIndex((i) => Math.min(totalSteps - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setActiveStepIndex((i) => Math.max(0, i - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay, totalSteps]);

  // Active clause highlight span for CodeMirror (only if current text matches traced SQL)
  const activeStep =
    traceResult?.mode === 'select_traced'
      ? traceResult.steps[Math.min(activeStepIndex, Math.max(0, traceResult.steps.length - 1))]
      : undefined;

  const activeHighlight = useMemo(() => {
    if (!activeStep?.span || !traceResult) return null;
    if (sqlText.trim() !== traceResult.sql.trim()) return null;
    // Account for any leading whitespace difference between editor text and trimmed traced SQL
    const leadingOffset = sqlText.indexOf(traceResult.sql);
    const offset = leadingOffset >= 0 ? leadingOffset : 0;
    return {
      clause: activeStep.clause,
      span: {
        start: activeStep.span.start + offset,
        end: activeStep.span.end + offset,
      },
    };
  }, [activeStep, sqlText, traceResult]);

  const previewTableSchema = useMemo(
    () => schema.find((t) => t.name === previewTableName) ?? null,
    [previewTableName, schema]
  );

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lg dark:border-rose-900 dark:bg-slate-900">
          <h1 className="text-base font-bold text-rose-700 dark:text-rose-400">
            Không thể khởi chạy SQLite WASM
          </h1>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header
        datasets={SAMPLE_DATASETS}
        activeDataset={activeDataset}
        onSelectDataset={handleSelectDataset}
        onResetDb={handleResetDb}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      {!engineReady ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Đang khởi tạo SQLite WebAssembly &amp; bộ dữ liệu mẫu...
          </p>
        </div>
      ) : (
        <div className="relative flex flex-1">
          {/* Left Sidebar (Desktop static, Mobile drawer) */}
          {sidebarOpen && (
            <>
              <div
                className="fixed inset-0 z-20 bg-slate-950/40 backdrop-blur-xs lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed inset-y-14 left-0 z-30 w-76 shrink-0 lg:sticky lg:top-14 lg:z-10 lg:h-[calc(100vh-3.5rem)] lg:w-76 xl:w-80">
                <SchemaSidebar
                  dataset={activeDataset}
                  schema={schema}
                  activePresetId={activePresetId}
                  onSelectPreset={handleSelectPreset}
                  onPreviewTable={handlePreviewTable}
                  onInsertIdentifier={handleInsertIdentifier}
                />
              </div>
            </>
          )}

          {/* Main Stage */}
          <main className="min-w-0 flex-1 p-3.5 sm:p-5">
            <div className="mx-auto max-w-6xl space-y-4">
              <SqlEditor
                value={sqlText}
                onChange={(val) => {
                  setSqlText(val);
                  setActivePresetId(null);
                }}
                onRun={() => runSql(sqlText)}
                schema={schema}
                darkMode={darkMode}
                activeHighlight={activeHighlight}
                executionTimeMs={traceResult?.executionTimeMs}
                verifiedWithSqlite={traceResult?.verifiedWithSqlite}
                error={traceResult && !traceResult.ok ? traceResult.error : undefined}
                errorHint={traceResult && !traceResult.ok ? traceResult.errorHint : undefined}
                activeClauseLabel={
                  activeStep ? `Bước ${activeStep.index + 1} · ${activeStep.badgeLabel}` : undefined
                }
              />

              <VisualizerStage
                result={traceResult}
                activeStepIndex={activeStepIndex}
                onSelectStep={handleSelectStep}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                playSpeed={playSpeed}
                onChangeSpeed={setPlaySpeed}
              />
            </div>
          </main>
        </div>
      )}

      {/* Table Data Preview Modal */}
      <TablePreviewModal
        tableSchema={previewTableSchema}
        data={previewData}
        onClose={() => {
          setPreviewTableName(null);
          setPreviewData(null);
        }}
        onQueryTable={handleQueryTable}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
