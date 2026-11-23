import { useState } from 'react';
import { ChevronDown, ChevronUp, Columns2 } from 'lucide-react';
import type { JoinPreviewData, SqlValue } from '../types/sql';

interface JoinVennCardProps {
  preview: JoinPreviewData;
}

function JoinVennSvg({ joinType }: { joinType: JoinPreviewData['joinType'] }) {
  const fillLeft = joinType === 'LEFT' || joinType === 'FULL' || joinType === 'CROSS';
  const fillRight = joinType === 'RIGHT' || joinType === 'FULL' || joinType === 'CROSS';
  const fillIntersect = true;

  return (
    <svg viewBox="0 0 120 72" className="h-14 w-24 shrink-0" aria-label={joinType}>
      <defs>
        <clipPath id="vennLeftClip">
          <circle cx="43" cy="36" r="25" />
        </clipPath>
      </defs>

      {/* Left circle */}
      <circle
        cx="43"
        cy="36"
        r="25"
        className={
          fillLeft
            ? 'fill-indigo-500/30 stroke-indigo-500 dark:fill-indigo-400/30 dark:stroke-indigo-400'
            : 'fill-slate-100 stroke-slate-300 dark:fill-slate-800/70 dark:stroke-slate-600'
        }
        strokeWidth="2"
      />

      {/* Right circle */}
      <circle
        cx="77"
        cy="36"
        r="25"
        className={
          fillRight
            ? 'fill-cyan-500/30 stroke-cyan-500 dark:fill-cyan-400/30 dark:stroke-cyan-400'
            : 'fill-slate-100 stroke-slate-300 dark:fill-slate-800/70 dark:stroke-slate-600'
        }
        strokeWidth="2"
      />

      {/* Intersection */}
      {fillIntersect && (
        <circle
          cx="77"
          cy="36"
          r="25"
          clipPath="url(#vennLeftClip)"
          className="fill-cyan-600/55 dark:fill-cyan-400/55"
        />
      )}

      {/* Outlines cleanly on top */}
      <circle
        cx="43"
        cy="36"
        r="25"
        fill="none"
        className="stroke-indigo-500/80 dark:stroke-indigo-400/80"
        strokeWidth="1.75"
      />
      <circle
        cx="77"
        cy="36"
        r="25"
        fill="none"
        className="stroke-cyan-500/80 dark:stroke-cyan-400/80"
        strokeWidth="1.75"
      />
      <text
        x="31"
        y="40"
        textAnchor="middle"
        className="fill-slate-700 font-mono text-[10px] font-bold dark:fill-slate-200"
      >
        L
      </text>
      <text
        x="89"
        y="40"
        textAnchor="middle"
        className="fill-slate-700 font-mono text-[10px] font-bold dark:fill-slate-200"
      >
        R
      </text>
    </svg>
  );
}

function formatMiniCell(val: SqlValue): string {
  if (val === null || val === undefined) return 'NULL';
  const s = String(val);
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}

export function JoinVennCard({ preview }: JoinVennCardProps) {
  const [showSourceTables, setShowSourceTables] = useState(false);

  const visibleLeftCols = preview.leftColumns.slice(0, 4);
  const visibleRightCols = preview.rightColumns.slice(0, 4);

  return (
    <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/40 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <JoinVennSvg joinType={preview.joinType} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-cyan-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                {preview.joinType} JOIN
              </span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                {preview.leftLabel} ⋈ {preview.rightLabel}
              </span>
            </div>
            <div className="font-mono text-[11.5px] text-cyan-800 dark:text-cyan-300">
              Điều kiện: <strong>{preview.conditionText}</strong>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                Khớp: {preview.matchedPairsCount} cặp
              </span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                Chỉ bên trái: {preview.leftOnlyCount} dòng
                {preview.joinType === 'LEFT' || preview.joinType === 'FULL'
                  ? ' (giữ + NULL)'
                  : ' (bỏ)'}
              </span>
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Chỉ bên phải: {preview.rightOnlyCount} dòng
                {preview.joinType === 'RIGHT' || preview.joinType === 'FULL'
                  ? ' (giữ + NULL)'
                  : ' (bỏ)'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSourceTables((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-50 dark:border-cyan-800 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-cyan-950/60"
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span>So sánh 2 bảng nguồn</span>
          {showSourceTables ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Side-by-side source match inspector */}
      {showSourceTables && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-cyan-200/70 pt-3 dark:border-cyan-900/50 lg:grid-cols-2">
          {/* Left table */}
          <div className="overflow-hidden rounded-lg border border-indigo-200/80 bg-white dark:border-indigo-900/60 dark:bg-slate-900">
            <div className="flex items-center justify-between bg-indigo-50/80 px-2.5 py-1.5 text-[11px] font-bold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              <span className="font-mono">Bảng trái: {preview.leftLabel}</span>
              <span>{preview.leftRows.length} dòng</span>
            </div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50">
                    {visibleLeftCols.map((c) => (
                      <th key={c.id} className="px-2 py-1 font-mono text-slate-500">
                        {c.name}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-sans text-slate-500">Khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {preview.leftRows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.matchCount === 0
                          ? 'bg-rose-50/60 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      {visibleLeftCols.map((c) => (
                        <td key={c.id} className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">
                          {formatMiniCell(row.cells[c.id])}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                            row.matchCount > 0
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {row.matchCount > 0 ? `×${row.matchCount}` : '0'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right table */}
          <div className="overflow-hidden rounded-lg border border-cyan-200/80 bg-white dark:border-cyan-900/60 dark:bg-slate-900">
            <div className="flex items-center justify-between bg-cyan-50/80 px-2.5 py-1.5 text-[11px] font-bold text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300">
              <span className="font-mono">Bảng phải: {preview.rightLabel}</span>
              <span>{preview.rightRows.length} dòng</span>
            </div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50">
                    {visibleRightCols.map((c) => (
                      <th key={c.id} className="px-2 py-1 font-mono text-slate-500">
                        {c.name}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-sans text-slate-500">Khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {preview.rightRows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.matchCount === 0
                          ? 'bg-slate-50/90 opacity-65 dark:bg-slate-900/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      {visibleRightCols.map((c) => (
                        <td key={c.id} className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">
                          {formatMiniCell(row.cells[c.id])}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                            row.matchCount > 0
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {row.matchCount > 0 ? `×${row.matchCount}` : '0'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
