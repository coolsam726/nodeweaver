export interface KanbanCardConfig {
  titleField: string;
  subtitleField?: string;
  fields: string[];
  badgeFields?: string[];
}

export interface KanbanSchema {
  title?: string;
  groupBy?: string;
  /**
   * Ordered group keys when `groupBy` is set (e.g. pipeline stages).
   * Empty columns are still shown so the board keeps a stable layout.
   */
  columns?: string[];
  /** Field used to sort cards within a column (ascending). */
  sequenceField?: string;
  /** Card mosaic columns when the board is ungrouped (default 4). */
  gridColumns?: number;
  /** @deprecated Use gridColumns */
  columnCount?: number;
  card: KanbanCardConfig;
}

export class KanbanBuilder {
  private config: KanbanSchema = {
    card: { titleField: 'name', fields: [] },
  };

  title(value: string): this {
    this.config.title = value;
    return this;
  }

  groupBy(field: string): this {
    this.config.groupBy = field;
    return this;
  }

  /**
   * Stable left-to-right column order for grouped boards.
   * Prefer this over relying on first-seen data order.
   */
  columns(...keys: string[]): this {
    this.config.columns = keys.map(String);
    return this;
  }

  /**
   * Sort cards within each column by this field (ascending).
   * @deprecated Prefer `columns(...)` for group order; this only sorts within a column.
   */
  sequence(field: string): this {
    this.config.sequenceField = field;
    return this;
  }

  card(titleField: string, subtitleField?: string): this {
    this.config.card.titleField = titleField;
    this.config.card.subtitleField = subtitleField;
    return this;
  }

  fields(...names: string[]): this {
    this.config.card.fields = names;
    return this;
  }

  badges(...names: string[]): this {
    this.config.card.badgeFields = names;
    return this;
  }

  /** Card mosaic columns when ungrouped (default 4). Ignored for grouped boards. */
  gridColumns(count: number): this {
    this.config.gridColumns = Math.max(1, Math.min(6, Math.floor(count)));
    return this;
  }

  /** @deprecated Use gridColumns */
  columnCount(count: number): this {
    return this.gridColumns(count);
  }

  build(): KanbanSchema {
    const gridColumns = this.config.gridColumns ?? this.config.columnCount ?? 4;
    return {
      ...this.config,
      gridColumns,
      columnCount: gridColumns,
      card: { ...this.config.card },
      columns: this.config.columns ? [...this.config.columns] : undefined,
    };
  }
}

export interface KanbanColumn {
  key: string;
  label: string;
  items: Record<string, unknown>[];
}

export function groupKanbanRecords(
  items: Record<string, unknown>[],
  groupBy: string | undefined,
  options?: {
    columnOrder?: string[];
    sequenceField?: string;
  },
): KanbanColumn[] {
  if (!groupBy) {
    return [{ key: 'all', label: 'All records', items: sortColumnItems(items, options?.sequenceField) }];
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const raw = item[groupBy];
    const key = raw === null || raw === undefined || raw === '' ? '__none__' : String(raw);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const key of options?.columnOrder ?? []) {
    const normalized = String(key);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    orderedKeys.push(normalized);
  }
  for (const key of groups.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    orderedKeys.push(key);
  }

  return orderedKeys.map((key) => {
    const groupItems = groups.get(key) ?? [];
    return {
      key,
      label: columnLabel(key, groupBy, groupItems[0]?.[groupBy]),
      items: sortColumnItems(groupItems, options?.sequenceField),
    };
  });
}

function sortColumnItems(
  items: Record<string, unknown>[],
  sequenceField?: string,
): Record<string, unknown>[] {
  if (!sequenceField) return items;
  return [...items].sort((a, b) => {
    const left = a[sequenceField];
    const right = b[sequenceField];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right), undefined, { numeric: true });
  });
}

function columnLabel(
  key: string,
  groupBy: string,
  sampleValue: unknown,
): string {
  if (key === '__none__') return '(no value)';
  if (groupBy === 'active' || typeof sampleValue === 'boolean') {
    if (key === 'true' || sampleValue === true) return 'Active';
    if (key === 'false' || sampleValue === false) return 'Inactive';
  }
  return key;
}

export function kanbanSelectFields(schema: KanbanSchema): string[] {
  const names = new Set<string>([
    'id',
    schema.card.titleField,
    ...(schema.card.subtitleField ? [schema.card.subtitleField] : []),
    ...schema.card.fields,
    ...(schema.card.badgeFields ?? []),
    ...(schema.groupBy ? [schema.groupBy] : []),
    ...(schema.sequenceField ? [schema.sequenceField] : []),
  ]);
  return [...names];
}
