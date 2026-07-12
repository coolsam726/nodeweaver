import {
  CreateAction,
  DeleteAction,
  EditAction,
  resolveActions,
  ViewAction,
  type ActionConfig,
  type ActionLike,
} from './actions.js';
import { groupKanbanRecords, type KanbanSchema } from './kanban.js';
import {
  resolveColumns,
  resolveFields,
  type Column,
  type Field,
} from './fields.js';
import { infolistFromFields, type InfolistSchema } from './infolist.js';
import { FormSchemaBuilder, type FormSchema } from './schema.js';
import type {
  ColumnConfig,
  FieldConfig,
  ResourceMeta,
  ResourcePresentation,
  SortDirection,
} from './types.js';
import { InfolistBuilder } from './infolist.js';
import { KanbanBuilder } from './kanban.js';
import type { LoomAuthUser } from './auth.js';
import { userHasPermission } from './abilities.js';
import type { PolicyClass } from './policy.js';

import { computeDisplayName } from './display-name.js';

export type { FormSchema } from './schema.js';
export type { InfolistSchema } from './infolist.js';
export type { KanbanSchema } from './kanban.js';

export interface TableSchema {
  columns: ColumnConfig[];
  defaultSort?: { field: string; direction: SortDirection };
}

export class TableBuilder {
  private items: Column[] = [];
  private sort?: { field: string; direction: SortDirection };

  column(column: Column): this {
    this.items.push(column);
    return this;
  }

  columns(...entries: Column[]): this {
    this.items.push(...entries);
    return this;
  }

  defaultSort(field: string, direction: SortDirection = 'desc'): this {
    this.sort = { field, direction };
    return this;
  }

  build(): TableSchema {
    return {
      columns: resolveColumns(this.items),
      defaultSort: this.sort,
    };
  }
}

/** Filament 5 alias */
export class Table extends TableBuilder {}

export abstract class Resource {
  static slug = 'resource';
  static label = 'Resources';
  static singularLabel = 'Resource';
  static model: string | (new (...args: never[]) => unknown) = 'Resource';
  static icon?: string;
  static navigationGroup?: string;
  static navigationSection?: string;
  static recordTitleField = 'name';
  /** Optional record-level policy (instance checks + list scope) */
  static policy?: PolicyClass;
  /**
   * Scope this resource to the active company when `auth.tenancy` is enabled.
   * Uses `companyId` unless `companyField` is set.
   */
  static companyScoped?: boolean;
  /** Company FK field (implies company scoping when tenancy is on). */
  static companyField?: string;
  /**
   * Soft-delete: stamp `deletedAt` (or `{ field }`) instead of hard delete.
   * List excludes trashed rows unless `?trashed=1`.
   */
  static softDelete?: boolean | { field?: string };

  /** Filament-style form schema */
  static form(_schema: FormSchemaBuilder): FormSchema {
    return new FormSchemaBuilder().build();
  }

  /** Filament-style table schema */
  static table(_table: TableBuilder): TableSchema {
    return new TableBuilder().build();
  }

  /** Optional detail/infolist schema */
  static detail(_infolist: InfolistBuilder): InfolistSchema | undefined {
    return undefined;
  }

  /** Optional kanban schema */
  static kanban(_kanban: KanbanBuilder): KanbanSchema | undefined {
    return undefined;
  }

  static headerActions(): ActionLike[] {
    return [CreateAction.make()];
  }

  static recordActions(): ActionLike[] {
    return [ViewAction.make(), EditAction.make(), DeleteAction.make()];
  }

  /** Quick edit/view in modal vs full page */
  static presentation(): Partial<ResourcePresentation> {
    return {};
  }

  /**
   * Extra abilities beyond the CRUD set (`viewAny`/`view`/`create`/`edit`/`delete`).
   * Seeded on boot as `{slug}:{ability}` (or as a full `resource:ability` name).
   *
   * @example
   * static permissions() {
   *   return ['export', 'publish', { name: 'approve', label: 'Approve deal' }];
   * }
   */
  static permissions(): Array<string | { name: string; label?: string }> {
    return [];
  }

  /** Whether the resource appears in navigation and is reachable */
  static canAccess(user: LoomAuthUser): boolean {
    return this.canViewAny(user);
  }

  static canViewAny(user: LoomAuthUser): boolean {
    if (this.policy?.viewAny) return Boolean(this.policy.viewAny(user));
    return userHasPermission(user, this.slug, 'viewAny');
  }

  static canView(user: LoomAuthUser, record?: Record<string, unknown>): boolean {
    if (this.policy?.view) return Boolean(this.policy.view(user, record ?? {}));
    return userHasPermission(user, this.slug, 'view');
  }

  static canCreate(user: LoomAuthUser): boolean {
    if (this.policy?.create) return Boolean(this.policy.create(user));
    return userHasPermission(user, this.slug, 'create');
  }

  static canEdit(user: LoomAuthUser, record?: Record<string, unknown>): boolean {
    if (this.policy?.edit) return Boolean(this.policy.edit(user, record ?? {}));
    return userHasPermission(user, this.slug, 'edit');
  }

  static canDelete(user: LoomAuthUser, record?: Record<string, unknown>): boolean {
    if (this.policy?.delete) return Boolean(this.policy.delete(user, record ?? {}));
    return userHasPermission(user, this.slug, 'delete');
  }

  static configure(): ResourceMeta {
    const form = this.form(new FormSchemaBuilder());
    const table = this.table(new TableBuilder());
    const detail = this.detail(new InfolistBuilder());
    const kanban = this.kanban(new KanbanBuilder());
    const hasExplicitDetail = detail !== undefined;
    const infolist = detail ?? infolistFromFields(form.fields);
    const actions = resolveActions([...this.headerActions(), ...this.recordActions()]);
    const presentation = resolvePresentation(this.presentation());

    const searchableFields = [
      ...form.fields.filter((f) => f.searchable).map((f) => f.name),
      ...table.columns.filter((c) => c.searchable).map((c) => c.name),
    ];

    return {
      slug: this.slug,
      label: this.label,
      singularLabel: this.singularLabel,
      model: this.model,
      navigationGroup: this.navigationGroup,
      navigationSection: this.navigationSection,
      recordTitleField: this.recordTitleField,
      icon: this.icon,
      fields: form.fields,
      form,
      columns: table.columns,
      infolist,
      kanban,
      actions,
      searchableFields: [...new Set(searchableFields)],
      defaultSort: table.defaultSort,
      hasKanban: Boolean(kanban),
      hasDetail: hasExplicitDetail || form.fields.length > 0,
      hasExplicitDetail,
      presentation,
      customPermissions: normalizeCustomPermissions(this.slug, this.permissions()),
      companyScoped: this.companyScoped,
      companyField: this.companyField,
      softDelete: this.softDelete,
    };
  }

  static recordTitle(record: Record<string, unknown>): string {
    return (
      computeDisplayName(record, this.recordTitleField) ||
      (record.id || record._id ? `#${record.id ?? record._id}` : 'Record')
    );
  }
}

export function extendResource<Base extends ResourceClassLike>(
  Base: Base,
  overrides: {
    slug?: string;
    label?: string;
    singularLabel?: string;
    model?: string | (new (...args: never[]) => unknown);
    icon?: string;
    navigationGroup?: string;
    recordTitleField?: string;
    form?: (schema: FormSchemaBuilder) => FormSchemaBuilder | void;
    table?: (table: TableBuilder) => TableBuilder | void;
    detail?: (infolist: InfolistBuilder) => InfolistBuilder | void;
    kanban?: (kanban: KanbanBuilder) => KanbanBuilder | void;
    headerActions?: () => ActionLike[];
    recordActions?: () => ActionLike[];
    presentation?: () => Partial<ResourcePresentation>;
  },
): ResourceClassLike {
  class ExtendedResource extends Resource {
    static override slug = overrides.slug ?? Base.slug;
    static override label = overrides.label ?? Base.label;
    static override singularLabel = overrides.singularLabel ?? Base.singularLabel;
    static override model = overrides.model ?? Base.model;
    static override icon = overrides.icon ?? Base.icon;
    static override navigationGroup = overrides.navigationGroup ?? Base.navigationGroup;
    static override recordTitleField = overrides.recordTitleField ?? Base.recordTitleField;

    static override form(schema: FormSchemaBuilder): FormSchema {
      const base = Base.form(new FormSchemaBuilder());
      if (!overrides.form) return base;
      const builder = FormSchemaBuilder.from(base);
      overrides.form(builder);
      return builder.build();
    }

    static override table(table: TableBuilder): TableSchema {
      const base = Base.table(new TableBuilder());
      if (!overrides.table) return base;
      const builder = new TableBuilder();
      overrides.table(builder);
      return builder.build();
    }

    static override detail(infolist: InfolistBuilder): InfolistSchema | undefined {
      if (overrides.detail) {
        overrides.detail(infolist);
        return infolist.build();
      }
      return Base.detail(new InfolistBuilder());
    }

    static override kanban(kanban: KanbanBuilder): KanbanSchema | undefined {
      if (overrides.kanban) {
        overrides.kanban(kanban);
        return kanban.build();
      }
      return Base.kanban(new KanbanBuilder());
    }

    static override headerActions(): ActionLike[] {
      return overrides.headerActions?.() ?? Base.headerActions();
    }

    static override recordActions(): ActionLike[] {
      return overrides.recordActions?.() ?? Base.recordActions();
    }

    static override presentation(): Partial<ResourcePresentation> {
      return overrides.presentation?.() ?? Base.presentation();
    }
  }

  return ExtendedResource as ResourceClassLike;
}

export function defineResource(config: {
  slug: string;
  label: string;
  singularLabel?: string;
  model: string | (new (...args: never[]) => unknown);
  icon?: string;
  navigationGroup?: string;
  recordTitleField?: string;
  form: (schema: FormSchemaBuilder) => FormSchemaBuilder | void;
  table: (table: TableBuilder) => TableBuilder | void;
  detail?: (infolist: InfolistBuilder) => InfolistBuilder | void;
  kanban?: (kanban: KanbanBuilder) => KanbanBuilder | void;
}): ResourceClassLike {
  class DefinedResource extends Resource {
    static override slug = config.slug;
    static override label = config.label;
    static override singularLabel = config.singularLabel ?? config.label;
    static override model = config.model;
    static override icon = config.icon;
    static override navigationGroup = config.navigationGroup;
    static override recordTitleField = config.recordTitleField ?? 'name';

    static override form(schema: FormSchemaBuilder): FormSchema {
      config.form(schema);
      return schema.build();
    }

    static override table(table: TableBuilder): TableSchema {
      config.table(table);
      return table.build();
    }

    static override detail(infolist: InfolistBuilder): InfolistSchema | undefined {
      if (!config.detail) return undefined;
      config.detail(infolist);
      return infolist.build();
    }

    static override kanban(kanban: KanbanBuilder): KanbanSchema | undefined {
      if (!config.kanban) return undefined;
      config.kanban(kanban);
      return kanban.build();
    }
  }

  return DefinedResource;
}

export type ResourceClassLike = {
  new (): unknown;
  slug: string;
  label: string;
  singularLabel: string;
  model: string | (new (...args: never[]) => unknown);
  icon?: string;
  navigationGroup?: string;
  recordTitleField: string;
  form(schema: FormSchemaBuilder): FormSchema;
  table(table: TableBuilder): TableSchema;
  detail(infolist: InfolistBuilder): InfolistSchema | undefined;
  kanban(kanban: KanbanBuilder): KanbanSchema | undefined;
  headerActions(): ActionLike[];
  recordActions(): ActionLike[];
  presentation(): Partial<ResourcePresentation>;
  recordTitle(record: Record<string, unknown>): string;
  configure(): ResourceMeta;
  canAccess(user: LoomAuthUser): boolean;
  canViewAny(user: LoomAuthUser): boolean;
  canView(user: LoomAuthUser, record?: Record<string, unknown>): boolean;
  canCreate(user: LoomAuthUser): boolean;
  canEdit(user: LoomAuthUser, record?: Record<string, unknown>): boolean;
  canDelete(user: LoomAuthUser, record?: Record<string, unknown>): boolean;
};

function resolvePresentation(
  config: Partial<ResourcePresentation>,
): ResourcePresentation {
  return {
    form: config.form ?? 'page',
    detail: config.detail ?? 'page',
  };
}

/**
 * Normalize resource `permissions()` entries into full `{resource}:{ability}` names.
 * Bare abilities (`export`) become `{slug}:export`; full names (`orders:export`) pass through.
 */
export function normalizeCustomPermissions(
  slug: string,
  entries: Array<string | { name: string; label?: string }>,
): Array<{ name: string; label?: string }> {
  const out: Array<{ name: string; label?: string }> = [];
  for (const entry of entries) {
    const raw = typeof entry === 'string' ? entry : entry.name;
    const label = typeof entry === 'string' ? undefined : entry.label;
    if (!raw?.trim()) continue;
    const name =
      raw === '*' || raw.includes(':') ? raw.trim() : `${slug}:${raw.trim()}`;
    out.push(label ? { name, label } : { name });
  }
  return out;
}

export { groupKanbanRecords };
