import type { FieldConfig } from './types.js';

export interface KanbanCardConfig {
  titleField: string;
  subtitleField?: string;
  fields: string[];
  badgeFields?: string[];
}

export interface KanbanSchema {
  title?: string;
  groupBy?: string;
  sequenceField?: string;
  /** Responsive card grid columns on large screens (default 4). Unrelated to groupBy. */
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

  /** Card grid columns on large screens (default 4). Responsive below lg. */
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
): KanbanColumn[] {
  if (!groupBy) {
    return [{ key: 'all', label: 'All records', items }];
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const raw = item[groupBy];
    const key = raw === null || raw === undefined || raw === '' ? '__none__' : String(raw);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    label: columnLabel(key, groupBy, groupItems[0]?.[groupBy]),
    items: groupItems,
  }));
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
