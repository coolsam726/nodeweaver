import type { ColumnSpan, GridColumns } from './types.js';

export interface GridLayoutOptions {
  columnSpan?: ColumnSpan;
  columnStart?: number;
}

export function resolveGridItemStyle(
  layout: GridLayoutOptions,
  sectionColumns: GridColumns = 1,
): string {
  const cols = Math.max(1, sectionColumns);
  const span =
    layout.columnSpan === 'full'
      ? cols
      : Math.min(Math.max(layout.columnSpan ?? 1, 1), cols);
  const start = layout.columnStart;

  if (start && start > 1) {
    const end = Math.min(start + span, cols + 1);
    return `grid-column: ${start} / ${end}`;
  }

  return `grid-column: span ${span}`;
}
