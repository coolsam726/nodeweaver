import type { ActionConfig } from './actions.js';
import type { VelmBranding } from './branding.js';
import type { FormSchema } from './schema.js';
import type { InfolistSchema } from './infolist.js';
import type { KanbanSchema } from './kanban.js';
import type { TableSchema } from './resource.js';

export type OrmKind = 'typeorm' | 'prisma' | 'drizzle' | 'mongoose';

export type SortDirection = 'asc' | 'desc';

export interface ListQuery {
  page: number;
  perPage: number;
  search?: string;
  sort?: string;
  direction?: SortDirection;
}

export interface PaginatedResult<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'relation'
  | 'email'
  | 'password';

export interface FieldConfig {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  hiddenOnForm?: boolean;
  hiddenOnTable?: boolean;
  hiddenOnDetail?: boolean;
  readonly?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ label: string; value: string | number }>;
  relation?: { resource: string; labelField: string };
  maxLength?: number;
  /** Only show on create (e.g. password) */
  createOnly?: boolean;
}

export interface ColumnConfig {
  name: string;
  type: FieldType | 'id';
  label?: string;
  searchable?: boolean;
  sortable?: boolean;
  format?: 'date' | 'datetime' | 'boolean' | 'badge' | 'toggle';
  hiddenOnTable?: boolean;
}

export interface NavigationItem {
  slug: string;
  label: string;
  icon?: string;
  group?: string;
}

export type ViewPresentation = 'page' | 'modal';

export interface ResourcePresentation {
  form: ViewPresentation;
  detail: ViewPresentation;
}

export interface ResourceMeta {
  slug: string;
  label: string;
  singularLabel: string;
  model: string | (new (...args: never[]) => unknown);
  navigationGroup?: string;
  navigationSection?: string;
  recordTitleField?: string;
  icon?: string;
  fields: FieldConfig[];
  form: FormSchema;
  columns: ColumnConfig[];
  infolist: InfolistSchema;
  kanban?: KanbanSchema;
  actions: ActionConfig[];
  searchableFields: string[];
  defaultSort?: { field: string; direction: SortDirection };
  hasKanban: boolean;
  hasDetail: boolean;
  /** When false, detail route renders a readonly form instead of an infolist */
  hasExplicitDetail: boolean;
  presentation: ResourcePresentation;
}

export interface VelmCompany {
  id: string;
  name: string;
  /** Per-tenant branding override (merged over module/env defaults) */
  branding?: Partial<VelmBranding>;
}

export interface VelmModuleOptions {
  basePath?: string;
  /** @deprecated Use `branding.brandName` */
  title?: string;
  branding?: Partial<VelmBranding>;
  orm?: OrmKind;
  resources: ResourceClass[];
  dataSource?: unknown;
  adapter?: import('../adapters/adapter.js').VelmAdapter;
  /** Shell chrome — company switcher */
  companies?: VelmCompany[];
  currentCompanyId?: string;
  /** Shell chrome — profile panel */
  user?: { name: string; email?: string; avatar?: string };
}

export type ResourceClass = {
  new (): unknown;
  configure(): ResourceMeta;
};

export const VELM_OPTIONS = Symbol('VELM_OPTIONS');
export const VELM_ADAPTER = Symbol('VELM_ADAPTER');
export const VELM_REGISTRY = Symbol('VELM_REGISTRY');
