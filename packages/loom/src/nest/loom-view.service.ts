import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import type { LoomFlash } from '../core/flash.js';
import type { ColumnConfig, FieldConfig, ResourceMeta } from '../core/types.js';
import { relationIdsFromValue, relationLabel, type RelationLabelMap } from '../core/relations.js';
import { resolveGridItemStyle } from '../core/layout.js';
import { listResourcePath, type ListViewQuery } from '../core/list-query.js';
import { loomViewsDir } from './paths.js';

export interface LoomLayoutContext {
  title: string;
  panelTitle: string;
  basePath: string;
  resources: ResourceMeta[];
  resource?: ResourceMeta;
  flash?: LoomFlash;
}

@Injectable()
export class LoomViewService {
  private readonly layout: Handlebars.TemplateDelegate;
  private readonly pages = new Map<string, Handlebars.TemplateDelegate>();
  private readonly partials = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    this.registerHelpers();
    const viewsDir = loomViewsDir();
    this.loadPartials(join(viewsDir, 'partials'));
    this.layout = this.compile(join(viewsDir, 'layouts', 'app.hbs'));
    this.loadPages(join(viewsDir, 'pages'));
  }

  render(page: string, context: Record<string, unknown>, options?: { layout?: 'app' | 'bare' }): string {
    const template = this.pages.get(page);
    if (!template) {
      throw new Error(`Loom view not found: ${page}`);
    }
    const body = template(context);
    if (options?.layout === 'bare') {
      return body;
    }
    return this.layout({ ...context, body });
  }

  private loadPages(dir: string): void {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.hbs')) continue;
      const name = file.replace(/\.hbs$/, '');
      this.pages.set(name, this.compile(join(dir, file)));
    }
  }

  private loadPartials(dir: string): void {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.hbs')) continue;
      const name = file.replace(/\.hbs$/, '');
      const template = this.compile(join(dir, file));
      this.partials.set(name, template);
      Handlebars.registerPartial(name, template);
    }
  }

  private compile(path: string): Handlebars.TemplateDelegate {
    const source = readFileSync(path, 'utf8');
    return Handlebars.compile(source, { noEscape: true });
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('or', (...args: unknown[]) => {
      const values = args.slice(0, -1);
      for (const value of values) {
        if (value) return value;
      }
      return values[values.length - 1];
    });
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper('gt', (a: unknown, b: unknown) => Number(a) > Number(b));
    Handlebars.registerHelper('lt', (a: unknown, b: unknown) => Number(a) < Number(b));
    Handlebars.registerHelper('inc', (value: unknown) => Number(value) + 1);
    Handlebars.registerHelper('dec', (value: unknown) => Number(value) - 1);
    Handlebars.registerHelper('and', (...args: unknown[]) => {
      const values = args.slice(0, -1);
      for (const value of values) {
        if (!value) return value;
      }
      return values[values.length - 1];
    });
    Handlebars.registerHelper('not', (value: unknown) => !value);
    Handlebars.registerHelper('t', (key: unknown, options: { hash?: { fallback?: string }; data?: { root?: Record<string, unknown> } }) => {
      const root = options?.data?.root;
      const translate = root?.t;
      if (typeof translate === 'function') {
        return translate(String(key ?? ''), options?.hash?.fallback);
      }
      return options?.hash?.fallback ?? String(key ?? '');
    });
    Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value));
    Handlebars.registerHelper('jsonAttr', (value: unknown) => {
      return JSON.stringify(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
    });
    Handlebars.registerHelper('gridItemStyle', (item: { columnSpan?: number | 'full'; columnStart?: number }, sectionColumns: number) => {
      return resolveGridItemStyle(item ?? {}, (sectionColumns || 2) as 1 | 2 | 3 | 4);
    });
    Handlebars.registerHelper('m2oConfig', (root: Record<string, unknown>, field: FieldConfig) => {
      const resource = root.resource as ResourceMeta | undefined;
      const slug = resource?.slug ?? '';
      const basePath = String(root.basePath ?? '');
      const fieldName = field.name;
      const relation = field.relation;
      const contexts = root.relationFieldContexts as Record<string, { singularLabel?: string }> | undefined;
      const labels = root.relationLabels as RelationLabelMap | undefined;
      const options = root.relationOptions as Record<string, Array<{ value: string; label: string }>> | undefined;
      const record = (root.record ?? {}) as Record<string, unknown>;
      const rawId = record[fieldName];
      const id =
        rawId !== null && rawId !== undefined && rawId !== '' ? String(rawId) : null;
      const fromOptions =
        id && options?.[fieldName]
          ? options[fieldName].find((item) => String(item.value) === id)?.label
          : '';
      const label = id ? labels?.[fieldName]?.[id] ?? fromOptions ?? '' : '';
      return {
        name: fieldName,
        relatedResource: relation?.resource ?? '',
        singularLabel: contexts?.[fieldName]?.singularLabel ?? relation?.resource ?? 'Record',
        searchUrl: `${basePath}/${slug}/relation-search?field=${encodeURIComponent(fieldName)}`,
        quickCreateUrl: `${basePath}/${slug}/relation-quick-create`,
        createUrl: `${basePath}/${relation?.resource ?? ''}/create`,
        detailUrlBase: `${basePath}/${relation?.resource ?? ''}`,
        initialId: id,
        initialLabel: label,
        readonly: Boolean(root.readonly) || Boolean(field.disabled),
        required: Boolean(field.required),
      };
    });
    Handlebars.registerHelper('m2mConfig', (root: Record<string, unknown>, field: FieldConfig) => {
      const resource = root.resource as ResourceMeta | undefined;
      const slug = resource?.slug ?? '';
      const basePath = String(root.basePath ?? '');
      const fieldName = field.name;
      const relation = field.relation;
      const contexts = root.relationFieldContexts as Record<string, { singularLabel?: string }> | undefined;
      const labels = root.relationLabels as RelationLabelMap | undefined;
      const options = root.relationOptions as Record<string, Array<{ value: string; label: string }>> | undefined;
      const record = (root.record ?? {}) as Record<string, unknown>;
      const ids = relationIdsFromValue(record[fieldName]);
      const optionMap = new Map(
        (options?.[fieldName] ?? []).map((item) => [String(item.value), item.label]),
      );
      const initialItems = ids.map((id) => ({
        id,
        label: labels?.[fieldName]?.[id] ?? optionMap.get(id) ?? id,
      }));
      const allOptions = (options?.[fieldName] ?? []).map((item) => ({
        id: String(item.value),
        label: item.label,
        group: (item as { group?: string }).group,
        ability: (item as { ability?: string }).ability,
      }));
      return {
        name: fieldName,
        relatedResource: relation?.resource ?? '',
        singularLabel: contexts?.[fieldName]?.singularLabel ?? relation?.resource ?? 'Record',
        searchUrl: `${basePath}/${slug}/relation-search?field=${encodeURIComponent(fieldName)}`,
        quickCreateUrl: `${basePath}/${slug}/relation-quick-create`,
        createUrl: `${basePath}/${relation?.resource ?? ''}/create`,
        detailUrlBase: `${basePath}/${relation?.resource ?? ''}`,
        initialItems,
        options: allOptions,
        widget: relation?.widget ?? 'combobox',
        checkboxColumns: relation?.checkboxColumns ?? 1,
        cascadeWildcards:
          relation?.cascadeWildcards ??
          (relation?.widget === 'checkboxList' ? true : false),
        groupBy: relation?.groupBy ?? '',
        checkboxFramed: relation?.checkboxFramed !== false,
        readonly: Boolean(root.readonly) || Boolean(field.disabled),
        required: Boolean(field.required),
      };
    });
    Handlebars.registerHelper('fieldChecked', (record: Record<string, unknown>, field: FieldConfig) => {
      const value = record[field.name];
      if (value === true || value === 'true' || value === '1' || value === 1) return true;
      if (value === false || value === 'false' || value === '0' || value === 0) return false;
      if (field.default === true || field.default === 'true') return true;
      return false;
    });
    Handlebars.registerHelper(
      'fieldValue',
      function (
        record: Record<string, unknown>,
        field: FieldConfig,
        options: { data?: { root?: { relationLabels?: RelationLabelMap } } },
      ) {
        const labels = options?.data?.root?.relationLabels;
        if (field.type === 'relation' || field.relation) {
          return relationLabel(field.name, record, labels, field.relation) || '—';
        }
        const value = record[field.name];
        if (value === null || value === undefined) return '';
        if (field.type === 'boolean') return value ? 'Yes' : 'No';
        return String(value);
      },
    );
    Handlebars.registerHelper(
      'cellValue',
      function (
        record: Record<string, unknown>,
        column: ColumnConfig,
        options: { data?: { root?: { relationLabels?: RelationLabelMap } } },
      ) {
        const labels = options?.data?.root?.relationLabels;
        if (column.type === 'relation' || column.relation) {
          return relationLabel(column.name, record, labels, column.relation) || '';
        }
        const value = record[column.name];
        if (value === null || value === undefined) return '';
        if (column.format === 'boolean' || column.type === 'boolean') {
          return value ? 'Yes' : 'No';
        }
        if (column.format === 'date' || column.format === 'datetime') {
          const date = new Date(String(value));
          return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
        }
        return String(value);
      },
    );
    Handlebars.registerHelper(
      'entryValue',
      function (
        record: Record<string, unknown>,
        entry: { name: string; type?: string; format?: string; relation?: ColumnConfig['relation'] },
        options: { data?: { root?: { relationLabels?: RelationLabelMap } } },
      ) {
        const labels = options?.data?.root?.relationLabels;
        if (entry.type === 'relation' || entry.relation) {
          return relationLabel(entry.name, record, labels, entry.relation) || '—';
        }
        const value = record[entry.name];
        if (value === null || value === undefined) return '—';
        if (entry.format === 'boolean') return value ? 'Yes' : 'No';
        if (entry.format === 'date' || entry.format === 'datetime') {
          const date = new Date(String(value));
          return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
        }
        return String(value);
      },
    );
    Handlebars.registerHelper(
      'kanbanFieldValue',
      function (
        record: Record<string, unknown>,
        fieldName: string,
        options: {
          data?: { root?: { relationLabels?: RelationLabelMap; resource?: ResourceMeta } };
        },
      ) {
        const root = options?.data?.root;
        const field = root?.resource?.fields.find((item) => item.name === fieldName);
        const column = root?.resource?.columns.find((item) => item.name === fieldName);
        const relation = column?.relation ?? field?.relation;
        const label = relationLabel(fieldName, record, root?.relationLabels, relation);
        if (label) return label;
        return String(record[fieldName] ?? '');
      },
    );
    Handlebars.registerHelper('kanbanCardTitle', (record: Record<string, unknown>, kanban: { card: { titleField: string } }) => {
      const value = record[kanban.card.titleField];
      return value !== undefined && value !== null && value !== '' ? String(value) : 'Untitled';
    });
    Handlebars.registerHelper('formInputType', (field: FieldConfig) => {
      switch (field.type) {
        case 'number':
          return 'number';
        case 'email':
          return 'email';
        case 'password':
          return 'password';
        case 'date':
          return 'date';
        case 'datetime':
          return 'datetime-local';
        default:
          return 'text';
      }
    });
    Handlebars.registerHelper('listUrl', function (
      this: unknown,
      basePath: string,
      slug: string,
      query: ListViewQuery,
      options?: Handlebars.HelperOptions,
    ) {
      const overrides = (options?.hash ?? {}) as ListViewQuery;
      return listResourcePath(basePath, slug, query ?? {}, overrides);
    });
    Handlebars.registerHelper('sortColumnUrl', (
      basePath: string,
      slug: string,
      query: ListViewQuery,
      columnName: string,
    ) => {
      const currentSort = query?.sort;
      const currentDirection = query?.direction;
      let direction: 'asc' | 'desc' = 'asc';
      if (currentSort === columnName) {
        direction = currentDirection === 'asc' ? 'desc' : 'asc';
      }
      return listResourcePath(basePath, slug, query ?? {}, {
        sort: columnName,
        direction,
        page: undefined,
      });
    });
  }
}
