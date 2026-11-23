import {
  Briefcase,
  Database,
  GraduationCap,
  Moon,
  RotateCcw,
  ShoppingBag,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { SampleDataset } from '../types/sql';

interface HeaderProps {
  datasets: SampleDataset[];
  activeDataset: SampleDataset;
  onSelectDataset: (datasetId: string) => void;
  onResetDb: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function DatasetIcon({ icon, className }: { icon: SampleDataset['icon']; className?: string }) {
  if (icon === 'graduation') return <GraduationCap className={className} />;
  if (icon === 'shopping') return <ShoppingBag className={className} />;
  return <Briefcase className={className} />;
}

export function Header({
  datasets,
  activeDataset,
  onSelectDataset,
  onResetDb,
  darkMode,
  onToggleDarkMode,
  sidebarOpen,
  onToggleSidebar,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 sm:px-4">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Thu gọn thanh bên' : 'Mở thanh bên'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-sm">
            <Database className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white sm:text-base">
                SQLFlow
              </span>
              <span className="hidden rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 sm:inline-block">
                SQLite WASM
              </span>
            </div>
            <p className="hidden text-[11px] text-slate-500 dark:text-slate-400 md:block">
              Trực quan hóa từng bước thực thi SQL
            </p>
          </div>
        </div>
      </div>

      {/* Dataset switcher */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-950/70">
        {datasets.map((ds) => {
          const active = ds.id === activeDataset.id;
          return (
            <button
              key={ds.id}
              type="button"
              onClick={() => onSelectDataset(ds.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                active
                  ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
              title={ds.description}
            >
              <DatasetIcon icon={ds.icon} className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{ds.shortName}</span>
            </button>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onResetDb}
          title="Khôi phục dữ liệu gốc của bộ dữ liệu hiện tại"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Đặt lại CSDL</span>
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
