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
  /** Record-level policy scope (equality filters) */
  scope?: import('./policy.js').LoomQueryScope;
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

export type RelationKind = 'many2one' | 'many2many' | 'one2many';

/** Presentation widget for multi-relations (m2m / o2m). Default: `combobox`. */
export type RelationWidget = 'combobox' | 'checkboxList' | 'relationTable';

export interface RelationConfig {
  kind: RelationKind;
  resource: string;
  /** Field on the related record to display (supports dotted paths, e.g. `email` or `address.city`) */
  labelField: string;
  /**
   * Parent field holding the FK / id array.
   * - many2one: scalar FK (default: field name)
   * - many2many / one2many: string[] of related ids (default: field name)
   */
  foreignKey?: string;
  /** Multi-relation UI widget (ignored for many2one). */
  widget?: RelationWidget;
  /** Column count for `checkboxList` (1–4, default 1). With `groupBy`, this is group cards per row. */
  checkboxColumns?: 1 | 2 | 3 | 4;
  /**
   * When true (default for checkboxList), selecting `*` or `resource:*`
   * disables more specific options covered by that wildcard.
   */
  cascadeWildcards?: boolean;
  /**
   * Group `checkboxList` options by a field on the related record
   * (e.g. `resource` for permissions).
   */
  groupBy?: string;
  /**
   * When true (default), wrap the checkbox list in a bordered fixed-height scroll area.
   * Set false for open layouts (e.g. permission clusters).
   */
  checkboxFramed?: boolean;
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
  /** Extra permissions declared on the resource (seeded into the catalog) */
  customPermissions: Array<{ name: string; label?: string }>;
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
  /**
   * Companies for shell branding display only.
   * Loom does not enforce multi-tenant isolation; use policies / app queries
   * for record-level company scoping.
   */
  companies?: LoomCompany[];
  /** Display-only active company id (branding merge); not a tenant switch */
  currentCompanyId?: string;
  /** Shell chrome — profile panel (overridden by session user when auth is enabled) */
  user?: { name: string; email?: string; avatar?: string; role?: string };
  /**
   * Enable cookie-session authentication for the admin panel and JSON API.
   * When set, all routes except login and assets require a signed-in user.
   */
  auth?: import('./auth.js').LoomAuthOptions;
  /**
   * Allow running without `auth.secret` in production.
   * Default false — production boots without a secret throw.
   * Development still allows an open admin when auth is omitted.
   */
  allowAnonymousAdmin?: boolean;
  /**
   * JSON API for the same resources + RBAC (default enabled).
   * Served at `/api/loom` unless `prefix` is overridden.
   * Set `false` to disable.
   */
  api?: boolean | {
    enabled?: boolean;
    /** Route prefix without leading slash (default: `api/loom`) */
    prefix?: string;
  };
}

export type ResourceClass = {
  new (): unknown;
  configure(): ResourceMeta;
  canAccess?(user: import('./auth.js').LoomAuthUser): boolean;
  canViewAny?(user: import('./auth.js').LoomAuthUser): boolean;
  canView?(user: import('./auth.js').LoomAuthUser, record?: Record<string, unknown>): boolean;
  canCreate?(user: import('./auth.js').LoomAuthUser): boolean;
  canEdit?(user: import('./auth.js').LoomAuthUser, record?: Record<string, unknown>): boolean;
  canDelete?(user: import('./auth.js').LoomAuthUser, record?: Record<string, unknown>): boolean;
};

export const LOOM_OPTIONS = Symbol('LOOM_OPTIONS');
export const LOOM_ADAPTER = Symbol('LOOM_ADAPTER');
export const LOOM_REGISTRY = Symbol('LOOM_REGISTRY');
