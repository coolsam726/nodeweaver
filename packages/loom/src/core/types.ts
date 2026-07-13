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
  /**
   * Soft-delete trash mode (when resource enables softDelete).
   * - false / omitted: active records only
   * - 'only' / true: trashed only
   * - 'with': active + trashed
   */
  trashed?: import('./soft-delete.js').TrashedMode;
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
  | 'password'
  | 'file'
  | 'image';

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
  /**
   * Preload options into the form HTML.
   * Default: false for combobox (search-only), true for checkboxList / relationTable.
   */
  preload?: boolean;
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
  /** File/image field limits */
  media?: {
    accept?: string[];
    maxBytes?: number;
    disk?: string;
  };
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
  /**
   * When true, records are scoped to the active company (`companyId` by default).
   * Requires `auth.tenancy` enabled.
   */
  companyScoped?: boolean;
  /** Override company FK field for this resource (implies company scoping). */
  companyField?: string;
  /**
   * Soft-delete support. When set, `delete` stamps `deletedAt` (or custom field)
   * and list excludes trashed rows unless `?trashed=1`.
   */
  softDelete?: boolean | import('./soft-delete.js').SoftDeleteConfig;
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
   * Static companies for shell branding (and fallback switcher labels).
   * When `auth.tenancy` is enabled, the switcher prefers live rows from the
   * companies resource; branding overrides here still merge by id.
   */
  companies?: LoomCompany[];
  /** Fallback active company id when the session has none (branding merge) */
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
   * Served at `/api/loom` unless `prefix` / `version` is overridden.
   * Set `false` to disable.
   */
  api?: boolean | {
    enabled?: boolean;
    /** Route prefix without leading slash (default: `api/loom` or `api/loom/{version}`) */
    prefix?: string;
    /** API version segment — when set, default prefix becomes `api/loom/{version}` */
    version?: string;
    /**
     * Emit OpenAPI 3 at `{prefix}/openapi.json` plus interactive docs (default off).
     * Spec + docs UIs are public (FastAPI-style); resource routes still require auth.
     *
     * `docs` controls the UI:
     * - `true` / omitted: Swagger at `{prefix}/docs` and Redoc at `{prefix}/redoc`
     * - `'swagger'` | `'redoc'`: that UI only (at `/docs`; Redoc also at `/redoc`)
     * - `false`: OpenAPI JSON only
     */
    openapi?: boolean | {
      path?: string;
      docs?: boolean | 'swagger' | 'redoc';
    };
  };
  /**
   * Observability hooks for admin + JSON API.
   * Request IDs are always assigned (`X-Request-Id` inbound/outbound).
   */
  observability?: {
    /**
     * Called when Loom catches an authorization or unexpected admin/API error.
     * Useful for Sentry / structured log pipelines.
     */
    onError?: (event: {
      error: unknown;
      requestId?: string;
      userId?: string;
      path?: string;
      resource?: string;
      ability?: string;
    }) => void;
    /** Log relation option / list queries slower than this many ms (default: off) */
    slowQueryMs?: number;
  };
  /**
   * UI locale for admin strings (default `en`).
   * Apps can pass `messages` to override keys.
   */
  locale?: string;
  /** Partial message catalog overrides merged over the built-in locale. */
  messages?: Record<string, string>;
  /**
   * Opt-in security headers for admin + JSON API responses.
   * Default off. Set `true` for Loom-compatible CSP + baseline headers,
   * or pass a config object to customize.
   */
  securityHeaders?: import('./security-headers.js').LoomSecurityHeadersOption;
  /** Pluggable file storage for `file` / `image` fields. */
  storage?: import('./storage.js').LoomStorageOption;
  /** Audit hooks for create/update/delete/restore/bulk/export. */
  audit?: import('./audit.js').LoomAuditOption;
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
export const LOOM_STORAGE = Symbol('LOOM_STORAGE');
