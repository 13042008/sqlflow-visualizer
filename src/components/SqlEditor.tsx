import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { SQLite, sql } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { CheckCircle2, Clock, Play, Sparkles, AlertTriangle } from 'lucide-react';
import { CLAUSE_STYLES } from '../engine/clauseTheme';
import type { ClauseType, TableSchema, TextSpan } from '../types/sql';

interface ActiveClauseHighlight {
  span: TextSpan;
  clause: ClauseType;
}

const setHighlightEffect = StateEffect.define<ActiveClauseHighlight | null>();

const clauseHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHighlightEffect)) {
        if (!effect.value) {
          return Decoration.none;
        }
        const { span, clause } = effect.value;
        const docLen = tr.state.doc.length;
        const from = Math.max(0, Math.min(span.start, docLen));
        const to = Math.max(from, Math.min(span.end, docLen));
        if (from >= to) return Decoration.none;
        const styleClass = CLAUSE_STYLES[clause]?.cmClass ?? 'cm-clause-from';
        const mark = Decoration.mark({
          class: `cm-clause-highlight ${styleClass}`,
        });
        return Decoration.set([mark.range(from, to)]);
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const lightSqlHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#4f46e5', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#4f46e5', fontWeight: '600' },
  { tag: tags.string, color: '#059669' },
  { tag: tags.number, color: '#d97706', fontWeight: '500' },
  { tag: tags.comment, color: '#94a3b8', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#64748b' },
  { tag: tags.operator, color: '#0891b2' },
  { tag: tags.name, color: '#1e293b' },
]);

const darkSqlHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#818cf8', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#818cf8', fontWeight: '600' },
  { tag: tags.string, color: '#34d399' },
  { tag: tags.number, color: '#fbbf24', fontWeight: '500' },
  { tag: tags.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#94a3b8' },
  { tag: tags.operator, color: '#22d3ee' },
  { tag: tags.name, color: '#e2e8f0' },
]);

interface SqlEditorProps {
  value: string;
  onChange: (nextVal: string) => void;
  onRun: () => void;
  schema: TableSchema[];
  darkMode: boolean;
  activeHighlight: ActiveClauseHighlight | null;
  executionTimeMs?: number;
  verifiedWithSqlite?: boolean;
  error?: string;
  errorHint?: string;
  activeClauseLabel?: string;
}

export function SqlEditor({
  value,
  onChange,
  onRun,
  schema,
  darkMode,
  activeHighlight,
  executionTimeMs,
  verifiedWithSqlite,
  error,
  errorHint,
  activeClauseLabel,
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);

  onRunRef.current = onRun;
  onChangeRef.current = onChange;

  // Build CodeMirror instance when theme or schema changes
  useEffect(() => {
    if (!hostRef.current) return;

    const schemaMap: Record<string, string[]> = {};
    for (const t of schema) {
      schemaMap[t.name] = t.columns.map((c) => c.name);
    }

    const themeExt = EditorView.theme(
      {
        '&': {
          backgroundColor: 'transparent',
          color: darkMode ? '#e2e8f0' : '#0f172a',
        },
        '.cm-content': {
          caretColor: darkMode ? '#818cf8' : '#4f46e5',
          padding: '10px 0',
        },
        '.cm-gutters': {
          color: darkMode ? '#64748b' : '#94a3b8',
          fontSize: '12px',
        },
        '.cm-activeLine': {
          backgroundColor: darkMode
            ? 'rgba(148, 163, 184, 0.06)'
            : 'rgba(15, 23, 42, 0.03)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
          color: darkMode ? '#cbd5e1' : '#475569',
        },
        '.cm-cursor': {
          borderLeftColor: darkMode ? '#818cf8' : '#4f46e5',
          borderLeftWidth: '2px',
        },
      },
      { dark: darkMode }
    );

    const runShortcut = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onRunRef.current();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        runShortcut,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        sql({
          dialect: SQLite,
          schema: schemaMap,
          upperCaseKeywords: true,
        }),
        autocompletion(),
        syntaxHighlighting(darkMode ? darkSqlHighlight : lightSqlHighlight),
        themeExt,
        clauseHighlightField,
        cmPlaceholder('Nhập câu lệnh SQL tại đây (nhấn Ctrl + Enter để chạy)...'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    if (activeHighlight) {
      view.dispatch({ effects: setHighlightEffect.of(activeHighlight) });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Rebuild only on theme or schema updates; value & highlight sync separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, schema]);

  // Sync external value changes (e.g. clicking preset query)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  // Sync active SQL clause highlight span
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setHighlightEffect.of(activeHighlight),
    });
  }, [activeHighlight]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Editor Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Trình soạn thảo SQL
          </span>
          {activeClauseLabel && activeHighlight && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLAUSE_STYLES[activeHighlight.clause].pillBg} ${CLAUSE_STYLES[activeHighlight.clause].pillText} ${CLAUSE_STYLES[activeHighlight.clause].pillBorder}`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Đang chạy: {activeClauseLabel}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {verifiedWithSqlite && !error && (
            <span
              title="Kết quả từng bước khớp 100% với động cơ SQLite WASM thật"
              className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 sm:inline-flex"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Khớp SQLite</span>
            </span>
          )}

          {typeof executionTimeMs === 'number' && !error && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
              <Clock className="h-3 w-3" />
              {executionTimeMs.toFixed(1)} ms
            </span>
          )}

          <button
            type="button"
            onClick={onRun}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:scale-[0.98]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Chạy &amp; Trực quan hóa</span>
            <kbd className="ml-1 hidden rounded bg-indigo-500/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-100 md:inline-block">
              Ctrl+↵
            </kbd>
          </button>
        </div>
      </div>

      {/* CodeMirror surface */}
      <div
        ref={hostRef}
        className="max-h-72 min-h-[144px] overflow-y-auto px-1 pb-1"
      />

      {/* Error Banner */}
      {error && (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div>
              <p className="font-semibold">{error}</p>
              {errorHint && (
                <p className="mt-0.5 text-[11.5px] text-rose-700/90 dark:text-rose-300/90">
                  Gợi ý: {errorHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
