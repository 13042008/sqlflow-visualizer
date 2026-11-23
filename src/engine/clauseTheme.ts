import type { ClauseType } from '../types/sql';

export interface ClauseStyle {
  label: string;
  shortLabel: string;
  cmClass: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  activeRing: string;
  accentHex: string;
  barBg: string;
  logicalOrder: number;
  summary: string;
}

export const CLAUSE_STYLES: Record<ClauseType, ClauseStyle> = {
  CTE: {
    label: 'WITH (CTE)',
    shortLabel: 'CTE',
    cmClass: 'cm-clause-from',
    pillBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    pillText: 'text-indigo-700 dark:text-indigo-300',
    pillBorder: 'border-indigo-200 dark:border-indigo-800',
    activeRing: 'ring-2 ring-indigo-500/40 border-indigo-500 dark:border-indigo-400',
    accentHex: '#4f46e5',
    barBg: 'bg-indigo-600',
    logicalOrder: 0,
    summary: 'Tạo bảng tạm có tên (Common Table Expression) trước khi thực thi truy vấn chính.',
  },
  FROM: {
    label: 'FROM',
    shortLabel: 'FROM',
    cmClass: 'cm-clause-from',
    pillBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    pillText: 'text-indigo-700 dark:text-indigo-300',
    pillBorder: 'border-indigo-200 dark:border-indigo-800',
    activeRing: 'ring-2 ring-indigo-500/40 border-indigo-500 dark:border-indigo-400',
    accentHex: '#4f46e5',
    barBg: 'bg-indigo-600',
    logicalOrder: 1,
    summary: 'Tải toàn bộ dữ liệu nguồn từ bảng gốc vào bộ nhớ làm việc.',
  },
  JOIN: {
    label: 'JOIN',
    shortLabel: 'JOIN',
    cmClass: 'cm-clause-join',
    pillBg: 'bg-cyan-50 dark:bg-cyan-950/60',
    pillText: 'text-cyan-700 dark:text-cyan-300',
    pillBorder: 'border-cyan-200 dark:border-cyan-800',
    activeRing: 'ring-2 ring-cyan-500/40 border-cyan-500 dark:border-cyan-400',
    accentHex: '#0891b2',
    barBg: 'bg-cyan-600',
    logicalOrder: 2,
    summary: 'Ghép nối các dòng giữa bảng hiện tại và bảng mới theo điều kiện ON/USING.',
  },
  WHERE: {
    label: 'WHERE',
    shortLabel: 'WHERE',
    cmClass: 'cm-clause-where',
    pillBg: 'bg-amber-50 dark:bg-amber-950/60',
    pillText: 'text-amber-700 dark:text-amber-300',
    pillBorder: 'border-amber-200 dark:border-amber-800',
    activeRing: 'ring-2 ring-amber-500/40 border-amber-500 dark:border-amber-400',
    accentHex: '#d97706',
    barBg: 'bg-amber-500',
    logicalOrder: 3,
    summary: 'Kiểm tra điều kiện lọc trên từng dòng riêng lẻ và loại bỏ dòng không đạt.',
  },
  GROUP_BY: {
    label: 'GROUP BY',
    shortLabel: 'GROUP BY',
    cmClass: 'cm-clause-group',
    pillBg: 'bg-violet-50 dark:bg-violet-950/60',
    pillText: 'text-violet-700 dark:text-violet-300',
    pillBorder: 'border-violet-200 dark:border-violet-800',
    activeRing: 'ring-2 ring-violet-500/40 border-violet-500 dark:border-violet-400',
    accentHex: '#7c3aed',
    barBg: 'bg-violet-600',
    logicalOrder: 4,
    summary: 'Phân nhóm các dòng có cùng giá trị khóa để tính các hàm tổng hợp (COUNT, SUM, AVG...).',
  },
  HAVING: {
    label: 'HAVING',
    shortLabel: 'HAVING',
    cmClass: 'cm-clause-having',
    pillBg: 'bg-rose-50 dark:bg-rose-950/60',
    pillText: 'text-rose-700 dark:text-rose-300',
    pillBorder: 'border-rose-200 dark:border-rose-800',
    activeRing: 'ring-2 ring-rose-500/40 border-rose-500 dark:border-rose-400',
    accentHex: '#e11d48',
    barBg: 'bg-rose-600',
    logicalOrder: 5,
    summary: 'Lọc bỏ các nhóm không thỏa điều kiện tổng hợp sau khi đã GROUP BY.',
  },
  SELECT: {
    label: 'SELECT',
    shortLabel: 'SELECT',
    cmClass: 'cm-clause-select',
    pillBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    pillText: 'text-emerald-700 dark:text-emerald-300',
    pillBorder: 'border-emerald-200 dark:border-emerald-800',
    activeRing: 'ring-2 ring-emerald-500/40 border-emerald-500 dark:border-emerald-400',
    accentHex: '#059669',
    barBg: 'bg-emerald-600',
    logicalOrder: 6,
    summary: 'Chọn các cột cần hiển thị, tính toán biểu thức mới và đặt bí danh (AS).',
  },
  DISTINCT: {
    label: 'DISTINCT',
    shortLabel: 'DISTINCT',
    cmClass: 'cm-clause-distinct',
    pillBg: 'bg-teal-50 dark:bg-teal-950/60',
    pillText: 'text-teal-700 dark:text-teal-300',
    pillBorder: 'border-teal-200 dark:border-teal-800',
    activeRing: 'ring-2 ring-teal-500/40 border-teal-500 dark:border-teal-400',
    accentHex: '#0d9488',
    barBg: 'bg-teal-600',
    logicalOrder: 7,
    summary: 'Loại bỏ các dòng có giá trị hoàn toàn giống nhau sau bước SELECT.',
  },
  SET_OP: {
    label: 'SET OP',
    shortLabel: 'UNION',
    cmClass: 'cm-clause-set',
    pillBg: 'bg-orange-50 dark:bg-orange-950/60',
    pillText: 'text-orange-700 dark:text-orange-300',
    pillBorder: 'border-orange-200 dark:border-orange-800',
    activeRing: 'ring-2 ring-orange-500/40 border-orange-500 dark:border-orange-400',
    accentHex: '#ea580c',
    barBg: 'bg-orange-600',
    logicalOrder: 8,
    summary: 'Kết hợp tập kết quả từ hai câu truy vấn (UNION / INTERSECT / EXCEPT).',
  },
  ORDER_BY: {
    label: 'ORDER BY',
    shortLabel: 'ORDER BY',
    cmClass: 'cm-clause-order',
    pillBg: 'bg-sky-50 dark:bg-sky-950/60',
    pillText: 'text-sky-700 dark:text-sky-300',
    pillBorder: 'border-sky-200 dark:border-sky-800',
    activeRing: 'ring-2 ring-sky-500/40 border-sky-500 dark:border-sky-400',
    accentHex: '#0284c7',
    barBg: 'bg-sky-600',
    logicalOrder: 9,
    summary: 'Sắp xếp thứ tự các dòng kết quả tăng dần (ASC) hoặc giảm dần (DESC).',
  },
  LIMIT: {
    label: 'LIMIT / OFFSET',
    shortLabel: 'LIMIT',
    cmClass: 'cm-clause-limit',
    pillBg: 'bg-purple-50 dark:bg-purple-950/60',
    pillText: 'text-purple-700 dark:text-purple-300',
    pillBorder: 'border-purple-200 dark:border-purple-800',
    activeRing: 'ring-2 ring-purple-500/40 border-purple-500 dark:border-purple-400',
    accentHex: '#9333ea',
    barBg: 'bg-purple-600',
    logicalOrder: 10,
    summary: 'Bỏ qua OFFSET dòng đầu (nếu có) và chỉ giữ tối đa LIMIT dòng cuối cùng.',
  },
};

export interface TableOriginColor {
  badge: string;
  headerBg: string;
  borderTop: string;
  dot: string;
}

export const TABLE_ORIGIN_COLORS: TableOriginColor[] = [
  {
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    headerBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',
    borderTop: 'border-t-indigo-500',
    dot: 'bg-indigo-500',
  },
  {
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    headerBg: 'bg-cyan-50/70 dark:bg-cyan-950/30',
    borderTop: 'border-t-cyan-500',
    dot: 'bg-cyan-500',
  },
  {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    headerBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    borderTop: 'border-t-amber-500',
    dot: 'bg-amber-500',
  },
  {
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    headerBg: 'bg-rose-50/70 dark:bg-rose-950/30',
    borderTop: 'border-t-rose-500',
    dot: 'bg-rose-500',
  },
  {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    headerBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    borderTop: 'border-t-emerald-500',
    dot: 'bg-emerald-500',
  },
];

export function getTableOriginColor(sourceIndex: number): TableOriginColor {
  if (sourceIndex < 0) {
    return {
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      headerBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
      borderTop: 'border-t-emerald-500',
      dot: 'bg-emerald-500',
    };
  }
  return TABLE_ORIGIN_COLORS[sourceIndex % TABLE_ORIGIN_COLORS.length];
}
