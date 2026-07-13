import type { ColumnConfig, ResourceMeta } from './types.js';

export type ListFilterOp = '=' | 'ilike';

export interface ListFilterChip {
  field: string;
  op: ListFilterOp;
  value: string | number | boolean;
  label?: string;
}

export type ListFilterKind = 'boolean' | 'm2o' | 'select' | 'none';
export type ListGroupKind = 'boolean' | 'm2o' | 'select' | 'none';

export interface ListColumnHeader {
  name: string;
  label: string;
  filter_kind: ListFilterKind;
  group_kind: ListGroupKind;
  /** Relation resource slug for m2o filter search */
  comodel?: string;
  /** FK field used when filtering/grouping relations */
  filterField?: string;
  options?: Array<{ label: string; value: string | number }>;
}

export const LIST_GROUP_FETCH_LIMIT = 500;

/** Max rows when the list "All records" page size is selected. */
export const LIST_ALL_RECORDS_PER_PAGE = 1000;

export function listColumnHeaders(meta: ResourceMeta): ListColumnHeader[] {
  return meta.columns
    .filter((column) => !column.hiddenOnTable)
    .map((column) => {
      const kinds = columnFilterGroupKinds(column, meta);
      const field = meta.fields.find((item) => item.name === column.name);
      return {
        name: column.name,
        label: column.label ?? column.name,
        filter_kind: kinds.filter,
        group_kind: kinds.group,
        comodel: column.relation?.resource,
        filterField: resolveFilterField(column),
        options: field?.options,
      };
    });
}

function columnFilterGroupKinds(
  column: ColumnConfig,
  meta?: ResourceMeta,
): {
  filter: ListFilterKind;
  group: ListGroupKind;
} {
  if (column.type === 'boolean' || column.format === 'boolean') {
    return { filter: 'boolean', group: 'boolean' };
  }
  if (column.type === 'relation' && column.relation?.kind === 'many2one') {
    return { filter: 'm2o', group: 'm2o' };
  }
  const field = meta?.fields.find((item) => item.name === column.name);
  if (
    (column.type === 'select' || field?.type === 'select') &&
    (field?.options?.length ?? 0) > 0
  ) {
    return { filter: 'select', group: 'select' };
  }
  return { filter: 'none', group: 'none' };
}

export function resolveFilterField(column: ColumnConfig): string {
  if (column.relation?.kind === 'many2one') {
    return column.relation.foreignKey ?? column.name;
  }
  return column.name;
}

export function parseListFilters(raw: string | undefined | null): ListFilterChip[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const chips: ListFilterChip[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const field = typeof row.field === 'string' ? row.field.trim() : '';
      if (!field) continue;
      const op: ListFilterOp = row.op === 'ilike' ? 'ilike' : '=';
      if (row.value === undefined || row.value === null) continue;
      chips.push({
        field,
        op,
        value: row.value as string | number | boolean,
        label: typeof row.label === 'string' ? row.label : undefined,
      });
    }
    return chips;
  } catch {
    return [];
  }
}

/** Map validated chips to equality scope values for adapters. */
export function filtersToEquals(
  meta: ResourceMeta,
  chips: ListFilterChip[] | undefined,
): Record<string, unknown> | undefined {
  if (!chips?.length) return undefined;
  const byName = new Map(meta.columns.map((column) => [column.name, column]));
  const equals: Record<string, unknown> = {};
  for (const chip of chips) {
    if (chip.op !== '=') continue;
    const column = byName.get(chip.field);
    if (!column) continue;
    const kinds = columnFilterGroupKinds(column, meta);
    if (kinds.filter === 'none') continue;
    const key = resolveFilterField(column);
    equals[key] = coerceFilterValue(column, chip.value, meta);
  }
  return Object.keys(equals).length > 0 ? equals : undefined;
}

export function resolveGroupByField(
  meta: ResourceMeta,
  groupBy: string | undefined,
): string | undefined {
  if (!groupBy?.trim()) return undefined;
  const column = meta.columns.find((item) => item.name === groupBy.trim());
  if (!column) return undefined;
  const kinds = columnFilterGroupKinds(column, meta);
  if (kinds.group === 'none') return undefined;
  return resolveFilterField(column);
}

function coerceFilterValue(
  column: ColumnConfig,
  value: string | number | boolean,
  meta?: ResourceMeta,
): unknown {
  const field = meta?.fields.find((item) => item.name === column.name);
  if (column.type === 'boolean' || column.format === 'boolean' || field?.type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return Boolean(value);
  }
  if (
    (column.type === 'number' || field?.type === 'number') &&
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

export interface ListGroupBucket {
  key: string;
  label: string;
  items: Record<string, unknown>[];
}

export function groupListRecords(
  items: Record<string, unknown>[],
  groupField: string,
  column: ColumnConfig | undefined,
  meta?: ResourceMeta,
  relationLabels?: Record<string, Record<string, string>>,
): ListGroupBucket[] {
  const field = meta?.fields.find((item) => item.name === column?.name);
  const buckets = new Map<string, ListGroupBucket>();
  for (const item of items) {
    const raw = item[groupField];
    const key = raw == null || raw === '' ? '__empty__' : String(raw);
    let label = '—';
    if (key === '__empty__') {
      label = '(Empty)';
    } else if (column?.type === 'boolean' || column?.format === 'boolean') {
      label = raw === true || raw === 'true' || raw === 1 ? 'Yes' : 'No';
    } else if (column?.type === 'select' || field?.type === 'select') {
      const opt = field?.options?.find((o) => String(o.value) === key);
      label = opt?.label ?? key;
    } else if (column?.relation && column.name) {
      label = relationLabels?.[column.name]?.[key] ?? key;
    } else {
      label = key;
    }
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, { key, label, items: [item] });
    }
  }
  return [...buckets.values()];
}
