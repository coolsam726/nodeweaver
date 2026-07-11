import type { ActionConfig } from './actions.js';
import type { LoomBranding } from './branding.js';
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

export type RelationKind = 'many2one';

export interface RelationConfig {
  kind: RelationKind;
  resource: string;
  /** Field on the related record to display (supports dotted paths, e.g. `email` or `address.city`) */
  labelField: string;
  /** FK on the parent record (defaults to the field/column name, or `relationKeyId` for dotted names) */
  foreignKey?: string;
}

export type ColumnSpan = number | 'full';
export type GridColumns = 1 | 2 | 3 | 4;

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
  disabled?: boolean;
  placeholder?: string;
  help?: string;
  prefix?: string;
  suffix?: string;
  options?: Array<{ label: string; value: string | number }>;
  relation?: RelationConfig;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  default?: unknown;
  autofocus?: boolean;
  /** Grid column span within the section (1..N or full row) */
  columnSpan?: ColumnSpan;
  /** 1-based grid column start */
  columnStart?: number;
  /** Boolean: render as inline toggle with label beside control */
  inline?: boolean;
  trueLabel?: string;
  falseLabel?: string;
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
  columnSpan?: ColumnSpan;
  columnStart?: number;
  relation?: RelationConfig;
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

export interface LoomCompany {
  id: string;
  name: string;
  /** Per-tenant branding override (merged over module/env defaults) */
  branding?: Partial<LoomBranding>;
}

export interface LoomModuleOptions {
  basePath?: string;
  /** @deprecated Use `branding.brandName` */
  title?: string;
  branding?: Partial<LoomBranding>;
  orm?: OrmKind;
  resources: ResourceClass[];
  dataSource?: unknown;
  adapter?: import('../adapters/adapter.js').LoomAdapter;
  /** Shell chrome — company switcher */
  companies?: LoomCompany[];
  currentCompanyId?: string;
  /** Shell chrome — profile panel */
  user?: { name: string; email?: string; avatar?: string };
}

export type ResourceClass = {
  new (): unknown;
  configure(): ResourceMeta;
};

export const LOOM_OPTIONS = Symbol('LOOM_OPTIONS');
export const LOOM_ADAPTER = Symbol('LOOM_ADAPTER');
export const LOOM_REGISTRY = Symbol('LOOM_REGISTRY');
