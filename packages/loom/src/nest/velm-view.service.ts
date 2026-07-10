import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import type { ColumnConfig, FieldConfig, ResourceMeta } from '../core/types.js';
import { listResourcePath, type ListViewQuery } from '../core/list-query.js';
import { velmViewsDir } from './paths.js';

export interface VelmLayoutContext {
  title: string;
  panelTitle: string;
  basePath: string;
  resources: ResourceMeta[];
  resource?: ResourceMeta;
  flash?: { type: 'success' | 'error'; message: string };
}

@Injectable()
export class VelmViewService {
  private readonly layout: Handlebars.TemplateDelegate;
  private readonly pages = new Map<string, Handlebars.TemplateDelegate>();
  private readonly partials = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    this.registerHelpers();
    const viewsDir = velmViewsDir();
    this.loadPartials(join(viewsDir, 'partials'));
    this.layout = this.compile(join(viewsDir, 'layouts', 'app.hbs'));
    this.loadPages(join(viewsDir, 'pages'));
  }

  render(page: string, context: Record<string, unknown>, options?: { layout?: 'app' | 'bare' }): string {
    const template = this.pages.get(page);
    if (!template) {
      throw new Error(`Velm view not found: ${page}`);
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
    Handlebars.registerHelper('or', (a: unknown, b: unknown) => a || b);
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper('gt', (a: unknown, b: unknown) => Number(a) > Number(b));
    Handlebars.registerHelper('lt', (a: unknown, b: unknown) => Number(a) < Number(b));
    Handlebars.registerHelper('inc', (value: unknown) => Number(value) + 1);
    Handlebars.registerHelper('dec', (value: unknown) => Number(value) - 1);
    Handlebars.registerHelper('and', (a: unknown, b: unknown) => Boolean(a && b));
    Handlebars.registerHelper('not', (value: unknown) => !value);
    Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value));
    Handlebars.registerHelper('fieldValue', (record: Record<string, unknown>, field: FieldConfig) => {
      const value = record[field.name];
      if (value === null || value === undefined) return '';
      if (field.type === 'boolean') return value ? 'Yes' : 'No';
      return String(value);
    });
    Handlebars.registerHelper('cellValue', (record: Record<string, unknown>, column: ColumnConfig) => {
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
    });
    Handlebars.registerHelper('entryValue', (record: Record<string, unknown>, entry: { name: string; format?: string }) => {
      const value = record[entry.name];
      if (value === null || value === undefined) return '—';
      if (entry.format === 'boolean') return value ? 'Yes' : 'No';
      if (entry.format === 'date' || entry.format === 'datetime') {
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
      }
      return String(value);
    });
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
