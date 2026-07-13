import type { ColumnConfig, ResourceMeta } from './types.js';
import { exportColumns } from './export.js';

export interface ImportParseResult {
  columns: ColumnConfig[];
  rows: Record<string, unknown>[];
  errors: string[];
}

/** Parse CSV text into row objects keyed by column `name` (headers may be labels). */
export function parseImportCsv(csv: string, meta: ResourceMeta): ImportParseResult {
  const columns = exportColumns(meta);
  const errors: string[] = [];
  const lines = splitCsvLines(csv);
  if (lines.length === 0) {
    return { columns, rows: [], errors: ['CSV is empty'] };
  }

  const headerCells = parseCsvLine(lines[0]!);
  if (headerCells.length === 0) {
    return { columns, rows: [], errors: ['CSV header row is empty'] };
  }

  const resolved = headerCells.map((header) => resolveImportColumn(header, columns));
  const missing = resolved.filter((item) => item == null);
  if (missing.length === headerCells.length) {
    return {
      columns,
      rows: [],
      errors: ['No CSV headers matched exportable columns (use Export as a template)'],
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 0; c < resolved.length; c += 1) {
      const column = resolved[c];
      if (!column) continue;
      if (column.name === 'id') continue;
      const raw = cells[c] ?? '';
      if (raw === '') continue;
      hasValue = true;
      row[column.name] = coerceImportCell(column, raw);
    }
    if (!hasValue) continue;
    rows.push(row);
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found');
  }

  return { columns, rows, errors };
}

function resolveImportColumn(
  header: string,
  columns: ColumnConfig[],
): ColumnConfig | undefined {
  const normalized = header.trim().toLowerCase();
  if (!normalized) return undefined;
  return (
    columns.find((col) => col.name.toLowerCase() === normalized) ||
    columns.find((col) => (col.label ?? col.name).toLowerCase() === normalized)
  );
}

function coerceImportCell(column: ColumnConfig, raw: string): unknown {
  if (column.type === 'boolean' || column.format === 'boolean') {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'y';
  }
  if (column.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (column.type === 'relation' && column.relation?.kind === 'many2many') {
    return raw
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return raw;
}

function splitCsvLines(csv: string): string[] {
  const normalized = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || lines.length > 0) lines.push(current);
  return lines;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
