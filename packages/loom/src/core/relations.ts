import { computeDisplayName, withDisplayNameFromMeta } from './display-name.js';
import type { LoomAdapter } from '../adapters/adapter.js';
import { recordIdFrom } from '../adapters/adapter.js';
import type { ResourceRegistry } from './registry.js';
import type {
  ColumnConfig,
  FieldConfig,
  RelationConfig,
  ResourceMeta,
} from './types.js';

export type RelationOption = { label: string; value: string };

/** field/column name → related id → display label */
export type RelationLabelMap = Record<string, Record<string, string>>;

export type RelationOptionsMap = Record<string, RelationOption[]>;

const RELATION_OPTIONS_LIMIT = 250;
const RELATION_SEARCH_LIMIT = 15;

export interface RelationFieldContext {
  resource: string;
  resourceLabel: string;
  singularLabel: string;
  labelField: string;
  formPresentation: 'page' | 'modal';
  detailPresentation: 'page' | 'modal';
}

export type RelationFieldContextMap = Record<string, RelationFieldContext>;

export function isMany2OneRelation(
  relation?: RelationConfig,
): relation is RelationConfig {
  return relation?.kind === 'many2one';
}

export function relationConfigForField(field: FieldConfig): RelationConfig | undefined {
  return isMany2OneRelation(field.relation) ? field.relation : undefined;
}

export function relationConfigForColumn(
  meta: ResourceMeta,
  column: ColumnConfig,
): RelationConfig | undefined {
  if (isMany2OneRelation(column.relation)) {
    return column.relation;
  }
  const field = meta.fields.find((item) => item.name === column.name);
  if (!field) return undefined;
  return relationConfigForField(field);
}

export function many2OneFields(meta: ResourceMeta): Array<FieldConfig & { relation: RelationConfig }> {
  return meta.fields.filter(
    (field): field is FieldConfig & { relation: RelationConfig } =>
      Boolean(relationConfigForField(field)),
  );
}

export function many2OneColumns(
  meta: ResourceMeta,
): Array<{ name: string; relation: RelationConfig }> {
  const fromColumns = meta.columns
    .map((column) => {
      const relation = relationConfigForColumn(meta, column);
      return relation ? { name: column.name, relation } : undefined;
    })
    .filter((item): item is { name: string; relation: RelationConfig } => Boolean(item));

  const seen = new Set(fromColumns.map((item) => item.name));
  for (const field of many2OneFields(meta)) {
    if (!seen.has(field.name)) {
      fromColumns.push({ name: field.name, relation: field.relation });
    }
  }
  return fromColumns;
}

export function relationForeignKey(
  name: string,
  relation?: RelationConfig,
): string {
  return relation?.foreignKey ?? name;
}

export function relationLabel(
  fieldName: string,
  record: Record<string, unknown>,
  labels?: RelationLabelMap,
  relation?: RelationConfig,
): string {
  const fk = relationForeignKey(fieldName, relation);
  const id = record[fk];
  if (id === null || id === undefined || id === '') {
    return '';
  }
  const mapped = labels?.[fieldName]?.[String(id)];
  return mapped ?? String(id);
}

export async function searchRelationOptions(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  relation: RelationConfig,
  search?: string,
  limit = RELATION_SEARCH_LIMIT,
): Promise<RelationOption[]> {
  const relatedMeta = registry.require(relation.resource);
  const result = await adapter.list(relatedMeta, {
    page: 1,
    perPage: Math.min(limit, RELATION_OPTIONS_LIMIT),
    search: search?.trim() || undefined,
  });
  return result.items.map((record) => toRelationOption(record, relation.labelField, relatedMeta));
}

export async function relationQuickCreate(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  parentMeta: ResourceMeta,
  fieldName: string,
  name: string,
): Promise<RelationOption> {
  const field = parentMeta.fields.find((item) => item.name === fieldName);
  const relation = field ? relationConfigForField(field) : undefined;
  if (!relation) {
    throw new Error(`Unknown relation field "${fieldName}"`);
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }

  const relatedMeta = registry.require(relation.resource);
  const writeField =
    relation.labelField === 'displayName'
      ? relatedMeta.recordTitleField ?? 'name'
      : relation.labelField.split('.')[0]!;
  const blocking = relatedMeta.fields.filter(
    (item) =>
      item.required &&
      !item.hiddenOnForm &&
      item.name !== writeField &&
      item.type !== 'password',
  );
  if (blocking.length > 0) {
    const labels = blocking.map((item) => item.label ?? item.name).join(', ');
    throw new RelationQuickCreateBlockedError(
      `Cannot quick-create: also requires ${labels}. Use Create and edit instead.`,
    );
  }

  const created = await adapter.create(relatedMeta, { [writeField]: trimmed });
  return toRelationOption(created, relation.labelField, relatedMeta);
}

export async function relationRecordSummary(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  resource: string,
  id: string,
  labelField?: string,
): Promise<RelationOption> {
  const relatedMeta = registry.require(resource);
  const record = await adapter.findOne(relatedMeta, id);
  const field = labelField ?? relatedMeta.recordTitleField ?? 'displayName';
  return toRelationOption(record, field, relatedMeta);
}

export function buildRelationFieldContexts(
  registry: ResourceRegistry,
  meta: ResourceMeta,
): RelationFieldContextMap {
  const out: RelationFieldContextMap = {};
  for (const field of many2OneFields(meta)) {
    const relatedMeta = registry.require(field.relation.resource);
    out[field.name] = {
      resource: field.relation.resource,
      resourceLabel: relatedMeta.label,
      singularLabel: relatedMeta.singularLabel,
      labelField: field.relation.labelField,
      formPresentation: relatedMeta.presentation.form,
      detailPresentation: relatedMeta.presentation.detail,
    };
  }
  return out;
}

export class RelationQuickCreateBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelationQuickCreateBlockedError';
  }
}

function toRelationOption(
  record: Record<string, unknown>,
  labelField: string,
  relatedMeta: ResourceMeta,
): RelationOption {
  return {
    value: recordIdFrom(record),
    label: formatRelationLabel(record, labelField, relatedMeta),
  };
}

export async function buildRelationOptions(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  relation: RelationConfig,
  search?: string,
): Promise<RelationOption[]> {
  const relatedMeta = registry.require(relation.resource);
  const result = await adapter.list(relatedMeta, {
    page: 1,
    perPage: RELATION_OPTIONS_LIMIT,
    search,
  });
  return result.items.map((record) => toRelationOption(record, relation.labelField, relatedMeta));
}

export async function buildRelationOptionsForForm(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  meta: ResourceMeta,
): Promise<RelationOptionsMap> {
  const out: RelationOptionsMap = {};
  for (const field of many2OneFields(meta)) {
    out[field.name] = await buildRelationOptions(adapter, registry, field.relation);
  }
  return out;
}

export async function buildRelationLabelMap(
  adapter: LoomAdapter,
  registry: ResourceRegistry,
  meta: ResourceMeta,
  records: Record<string, unknown>[],
): Promise<RelationLabelMap> {
  const out: RelationLabelMap = {};
  const columns = many2OneColumns(meta);
  if (columns.length === 0 || records.length === 0) {
    return out;
  }

  for (const { name, relation } of columns) {
    const fk = relationForeignKey(name, relation);
    const ids = [
      ...new Set(
        records
          .map((record) => record[fk])
          .filter((value) => value !== null && value !== undefined && value !== '')
          .map((value) => String(value)),
      ),
    ];
    if (ids.length === 0) continue;

    const relatedMeta = registry.require(relation.resource);
    const related = await adapter.findManyByIds(relatedMeta, ids);
    const byId: Record<string, string> = {};
    for (const record of related) {
      const id = recordIdFrom(record);
      if (!id) continue;
      byId[id] = formatRelationLabel(record, relation.labelField, relatedMeta);
    }
    out[name] = byId;
  }

  return out;
}

function formatRelationLabel(
  record: Record<string, unknown>,
  labelField: string,
  relatedMeta: ResourceMeta,
): string {
  const enriched = record.displayName
    ? record
    : withDisplayNameFromMeta(record, relatedMeta);

  if (labelField === 'displayName') {
    return String(enriched.displayName || relatedMeta.singularLabel);
  }

  const value = getByPath(enriched, labelField);
  if (value !== undefined && value !== null && value !== '') {
    return String(value);
  }

  return (
    computeDisplayName(enriched, relatedMeta.recordTitleField) ||
    relatedMeta.singularLabel
  );
}

export function getByPath(record: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) {
    return record[path];
  }
  let current: unknown = record;
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
