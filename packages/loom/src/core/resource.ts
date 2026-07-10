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
    };
  }

  static recordTitle(record: Record<string, unknown>): string {
    const field = this.recordTitleField;
    const value = record[field] ?? record.name ?? record.title ?? record.email;
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    const id = record.id ?? record._id;
    return id ? `#${id}` : 'Record';
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
};

function resolvePresentation(
  config: Partial<ResourcePresentation>,
): ResourcePresentation {
  return {
    form: config.form ?? 'page',
    detail: config.detail ?? 'page',
  };
}

export { groupKanbanRecords };
