import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  GitBranch,
  KeyRound,
  Link2,
  Play,
  Table2,
} from 'lucide-react';
import type {
  DatasetPresetQuery,
  QueryDifficulty,
  SampleDataset,
  TableSchema,
} from '../types/sql';

interface SchemaSidebarProps {
  dataset: SampleDataset;
  schema: TableSchema[];
  activePresetId: string | null;
  onSelectPreset: (preset: DatasetPresetQuery) => void;
  onPreviewTable: (tableName: string) => void;
  onInsertIdentifier: (text: string) => void;
}

const LEVEL_STYLES: Record<QueryDifficulty, string> = {
  'Cơ bản': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  'Trung bình': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  'Nâng cao': 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
};

export function SchemaSidebar({
  dataset,
  schema,
  activePresetId,
  onSelectPreset,
  onPreviewTable,
  onInsertIdentifier,
}: SchemaSidebarProps) {
  const [activeTab, setActiveTab] = useState<'presets' | 'schema'>('presets');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    schema.forEach((t) => {
      map[t.name] = true;
    });
    return map;
  });

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [name]: !(prev[name] ?? true),
    }));
  };

  // Extract foreign key relations for quick visual overview
  const fkRelations: Array<{ from: string; to: string }> = [];
  for (const t of schema) {
    for (const col of t.columns) {
      if (col.fk) {
        fkRelations.push({
          from: `${t.name}.${col.name}`,
          to: `${col.fk.table}.${col.fk.column}`,
        });
      }
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Dataset summary */}
      <div className="border-b border-slate-200 px-3.5 py-3 dark:border-slate-800">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {dataset.name}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {dataset.description}
        </p>

        {/* Segmented tabs */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
              activeTab === 'presets'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Ví dụ ({dataset.presets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
              activeTab === 'schema'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            <span>Bảng ({schema.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'presets' ? (
          <div className="space-y-2.5">
            {dataset.presets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  className={`group w-full rounded-xl border p-3 text-left transition-all ${
                    isActive
                      ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-400/40 dark:border-indigo-500 dark:bg-indigo-950/40'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold leading-snug text-slate-800 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
                      {preset.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_STYLES[preset.level]}`}
                    >
                      {preset.level}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {preset.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                    <div className="flex flex-wrap gap-1">
                      {preset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100 dark:text-indigo-400">
                      <Play className="h-2.5 w-2.5 fill-current" />
                      Chạy
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {schema.map((table) => {
              const isOpen = expandedTables[table.name] ?? true;
              return (
                <div
                  key={table.name}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => toggleTable(table.name)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                      <span className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {table.name}
                      </span>
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {table.rowCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPreviewTable(table.name)}
                      title={`Xem toàn bộ dữ liệu bảng ${table.name}`}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-100/70 dark:text-indigo-400 dark:hover:bg-indigo-950"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Xem</span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/70">
                      {table.columns.map((col) => (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => onInsertIdentifier(col.name)}
                          title="Nhấp để chèn tên cột vào trình soạn thảo"
                          className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {col.pk ? (
                              <KeyRound
                                className="h-3 w-3 shrink-0 text-amber-500"
                                aria-label="Primary Key"
                              />
                            ) : col.fk ? (
                              <Link2
                                className="h-3 w-3 shrink-0 text-cyan-500"
                                aria-label={`Foreign Key -> ${col.fk.table}.${col.fk.column}`}
                              />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                            )}
                            <span className="truncate font-mono text-[11.5px] text-slate-700 dark:text-slate-200">
                              {col.name}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {col.fk && (
                              <span className="rounded bg-cyan-50 px-1 py-0.5 font-mono text-[9.5px] text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                                → {col.fk.table}
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              {col.type}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {fkRelations.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <GitBranch className="h-3.5 w-3.5 text-cyan-500" />
                  <span>Quan hệ khóa ngoại</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {fkRelations.map((rel) => (
                    <div
                      key={`${rel.from}-${rel.to}`}
                      className="flex items-center justify-between gap-1 rounded-md bg-white px-2 py-1 font-mono text-[10.5px] text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300"
                    >
                      <span className="truncate">{rel.from}</span>
                      <span className="text-cyan-500">→</span>
                      <span className="truncate font-semibold text-indigo-600 dark:text-indigo-400">
                        {rel.to}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
