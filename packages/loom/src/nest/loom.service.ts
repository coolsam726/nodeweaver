import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { computeDisplayName } from '../core/display-name.js';
import type { LoomAdapter } from '../adapters/adapter.js';
import { resolveBranding, type LoomBranding } from '../core/branding.js';
import { ResourceRegistry } from '../core/registry.js';
import { menuLayoutContext } from '../core/menu.js';
import {
  buildRelationFieldContexts,
  buildRelationLabelMap,
  buildRelationOptionsForForm,
  relationIdsFromValue,
  relationQuickCreate,
  searchRelationOptions,
  shouldPreloadRelation,
  type RelationFieldContextMap,
  type RelationLabelMap,
  type RelationOption,
  type RelationOptionsMap,
} from '../core/relations.js';
import { createTranslator } from '../core/i18n.js';
import {
  emitLoomAudit,
  redactAuditRecord,
  resolveAuditConfig,
  type LoomAuditConfig,
} from '../core/audit.js';
import {
  buildExportFilename,
  exportColumns,
  parseExportFormat,
  recordsToCsv,
  recordsToJson,
  type ExportFormat,
} from '../core/export.js';
import { canExport, canImport } from '../core/list-actions.js';
import { filtersToEquals, resolveGroupByField } from '../core/list-filters.js';
import { parseImportCsv } from '../core/import.js';
import type { ListQuery, ResourceMeta, LoomModuleOptions, LoomCompany } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY, LOOM_STORAGE } from '../core/types.js';
import {
  defaultAdminBasePath,
  joinAppPath,
  normalizeAppBasePath,
} from '../core/app-path.js';
import {
  decodeBase64Upload,
  validateMediaUpload,
  type LoomStorageAdapter,
  type StoredMedia,
} from '../core/storage.js';
import { recordIdFrom } from '../adapters/adapter.js';
import { LoomAuthService } from './loom-auth.service.js';
import {
  currentCsrfToken,
  currentLoomUser,
  hashPassword,
  type LoomAuthUser,
} from '../core/auth.js';
import {
  LoomAuthorizationError,
  assertCan,
  can,
  isAdmin,
} from '../core/abilities.js';
import {
  assertPolicy,
  scopeList,
  type PolicyClass,
} from '../core/policy.js';
import {
  companyScopeForUser,
  mergeQueryScopes,
  recordMatchesCompany,
  resourceCompanyField,
  tenancyCompanyField,
  tenancyEnabled,
  tenancyMembershipField,
} from '../core/tenancy.js';
import { currentRequestContext, setRequestContextField } from '../core/request-context.js';

@Injectable()
export class LoomService {
  private readonly logger = new Logger(LoomService.name);
  private readonly auditConfig: LoomAuditConfig | null;

  constructor(
    @Inject(LOOM_ADAPTER) private readonly adapter: LoomAdapter,
    @Inject(LOOM_REGISTRY) private readonly registry: ResourceRegistry,
    @Inject(LOOM_OPTIONS) private readonly options: LoomModuleOptions,
    @Inject(LOOM_STORAGE) private readonly storage: LoomStorageAdapter | null,
    @Inject(forwardRef(() => LoomAuthService))
    private readonly authService: LoomAuthService,
  ) {
    this.auditConfig = resolveAuditConfig(this.options.audit);
  }

  private async timed<T>(op: string, slug: string, fn: () => Promise<T> | T): Promise<T> {
    const threshold = this.options.observability?.slowQueryMs;
    const started = Date.now();
    try {
      return await fn();
    } finally {
      const ms = Date.now() - started;
      if (threshold != null && ms >= threshold) {
        this.logger.warn(`Slow Loom ${op} on ${slug}: ${ms}ms`);
      }
    }
  }

  get csrfToken(): string {
    return currentCsrfToken();
  }
  get appBasePath(): string {
    return normalizeAppBasePath(this.options.appBasePath);
  }

  get homePath(): string {
    return this.appBasePath || '/';
  }

  get basePath(): string {
    return this.options.basePath ?? defaultAdminBasePath(this.appBasePath);
  }

  get panelTitle(): string {
    return this.branding.brandName;
  }

  get branding(): LoomBranding {
    const company = this.companies.find((item) => item.id === this.currentCompanyId);
    return resolveBranding(this.options.branding, company?.branding, this.options.title);
  }

  get locale(): string {
    return this.options.locale ?? 'en';
  }

  t(key: string, fallback?: string): string {
    return createTranslator(this.locale, this.options.messages)(key, fallback);
  }

  get authEnabled(): boolean {
    return Boolean(this.options.auth?.secret);
  }

  get loginPath(): string {
    return this.authService.loginPath;
  }

  get logoutPath(): string {
    return this.authService.logoutPath;
  }

  get accountPath(): string {
    return this.authService.accountPath;
  }

  get changePasswordPath(): string {
    return this.authService.changePasswordPath;
  }

  get forgotPasswordPath(): string {
    return this.authService.forgotPasswordPath;
  }

  get resetPasswordPath(): string {
    return this.authService.resetPasswordPath;
  }

  get apiEnabled(): boolean {
    return Boolean(
      this.options.api !== false &&
        !(typeof this.options.api === 'object' && this.options.api.enabled === false),
    );
  }

  get apiPrefix(): string {
    const api = this.options.api;
    const appBase = this.appBasePath;
    let relative = 'api/loom';
    if (api && typeof api === 'object' && api.prefix) {
      relative = api.prefix.replace(/^\//, '').replace(/\/$/, '') || 'api/loom';
      const appCtrl = appBase.replace(/^\//, '');
      if (appCtrl && (relative === appCtrl || relative.startsWith(`${appCtrl}/`))) {
        return relative;
      }
    } else if (api && typeof api === 'object' && api.version) {
      const version = api.version.replace(/^\//, '').replace(/\/$/, '');
      relative = version ? `api/loom/${version}` : 'api/loom';
    }
    return joinAppPath(appBase, relative).replace(/^\//, '');
  }

  get apiVersion(): string | undefined {
    const api = this.options.api;
    if (api && typeof api === 'object') return api.version;
    return undefined;
  }

  get openapiEnabled(): boolean {
    const api = this.options.api;
    if (!this.apiEnabled || !api || typeof api !== 'object') return false;
    return Boolean(api.openapi);
  }

  /**
   * Interactive docs mode when OpenAPI is on.
   * `false` = spec only; `'both'` = Swagger `/docs` + Redoc `/redoc`.
   */
  get openapiDocsMode(): false | 'swagger' | 'redoc' | 'both' {
    if (!this.openapiEnabled) return false;
    const api = this.options.api;
    if (api && typeof api === 'object' && api.openapi && typeof api.openapi === 'object') {
      const docs = api.openapi.docs;
      if (docs === false) return false;
      if (docs === 'swagger' || docs === 'redoc') return docs;
    }
    return 'both';
  }

  get openapiDocsEnabled(): boolean {
    return this.openapiDocsMode !== false;
  }

  get openapiSwaggerEnabled(): boolean {
    const mode = this.openapiDocsMode;
    return mode === 'swagger' || mode === 'both';
  }

  get openapiRedocEnabled(): boolean {
    const mode = this.openapiDocsMode;
    return mode === 'redoc' || mode === 'both';
  }

  /**
   * Absolute path to interactive API docs when OpenAPI docs are enabled.
   * Prefers Swagger (`/docs`); falls back to Redoc (`/redoc`).
   */
  get apiDocsPath(): string | undefined {
    if (!this.openapiDocsEnabled) return undefined;
    const prefix = `/${this.apiPrefix.replace(/^\//, '')}`;
    if (this.openapiSwaggerEnabled) return `${prefix}/docs`;
    if (this.openapiRedocEnabled) return `${prefix}/redoc`;
    return undefined;
  }

  get storageEnabled(): boolean {
    return Boolean(this.storage);
  }

  get localMediaRoot(): string | null {
    const storage = this.options.storage;
    if (
      storage &&
      typeof storage === 'object' &&
      'disk' in storage &&
      (storage as import('../core/storage.js').LocalStorageConfig).disk === 'local'
    ) {
      return (storage as import('../core/storage.js').LocalStorageConfig).root;
    }
    return null;
  }

  resources(): ResourceMeta[] {
    return this.registry.all();
  }

  /** Resources the current user may access (for nav / API discovery). */
  accessibleResources(): ResourceMeta[] {
    const user = this.authUser();
    if (!this.authEnabled || !user) {
      return this.authEnabled ? [] : this.registry.all();
    }
    return this.registry.all().filter((meta) => {
      const resourceClass = this.registry.resourceClass(meta.slug);
      return resourceClass?.canAccess?.(user) ?? resourceClass?.canViewAny?.(user) ?? true;
    });
  }

  /**
   * Full resource catalog for OpenAPI / docs.
   * Live JSON routes still enforce RBAC; the schema is intentionally public when OpenAPI is on.
   */
  documentedResources(): ResourceMeta[] {
    return this.registry.all();
  }

  /** Session user for API responses (no secrets). */
  authUserPublic(): {
    id: string;
    name: string;
    email: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
    companyId?: string;
    avatar?: string;
  } | null {
    const user = this.authUser();
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.roles?.[0] ?? user.role,
      roles: user.roles,
      permissions: user.permissions,
      companyId: user.companyId,
      avatar: user.avatar,
    };
  }

  /** Strip password / sensitive fields before returning records over the API. */
  sanitizeRecord(
    meta: ResourceMeta,
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const hidden = new Set(
      meta.fields.filter((field) => field.type === 'password').map((field) => field.name),
    );
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (hidden.has(key) || key === 'password') continue;
      out[key] = value;
    }
    return out;
  }

  meta(slug: string): ResourceMeta {
    return this.registry.require(slug);
  }

  list(slug: string, query: ListQuery) {
    this.authorize(slug, 'viewAny');
    const user = this.authUser();
    const policy = this.policyFor(slug);
    const meta = this.meta(slug);
    const filterScope = filtersToEquals(meta, query.filters);
    const groupField = resolveGroupByField(meta, query.groupBy);
    const scoped = {
      ...query,
      groupBy: groupField ? query.groupBy : undefined,
      scope: mergeQueryScopes(
        filterScope ? { equals: filterScope } : undefined,
        this.mergedScope(slug, user, query.scope, policy),
      ),
    };
    return this.timed('list', slug, () => this.adapter.list(meta, scoped));
  }

  async findOne(slug: string, id: string) {
    const record = await this.adapter.findOne(this.meta(slug), id);
    this.authorizeRecord(slug, 'view', record);
    return record;
  }

  create(slug: string, data: Record<string, unknown>) {
    return this.createRecord(slug, data);
  }

  async update(slug: string, id: string, data: Record<string, unknown>) {
    const existing = await this.adapter.findOne(this.meta(slug), id);
    this.authorizeRecord(slug, 'edit', existing);
    const writable = await this.pickWritable(slug, data, 'edit');
    this.syncUserCompanyConsistency(slug, writable, existing);
    const updated = await this.adapter.update(this.meta(slug), id, writable);
    const userSlug = this.options.auth?.userResource ?? 'users';
    const passwordField = this.options.auth?.passwordField ?? 'password';
    if (slug === userSlug && writable[passwordField] != null) {
      await this.authService.bumpSessionVersion(id);
    }
    await this.auditMutation(slug, 'update', {
      recordId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  async delete(slug: string, id: string) {
    const existing = await this.adapter.findOne(this.meta(slug), id);
    this.authorizeRecord(slug, 'delete', existing);
    const result = await this.adapter.delete(this.meta(slug), id);
    await this.auditMutation(slug, 'delete', {
      recordId: id,
      before: existing,
      after: null,
    });
    return result;
  }

  async restore(slug: string, id: string) {
    const meta = this.meta(slug);
    if (!meta.softDelete) {
      throw new Error(`Soft delete is not enabled for ${slug}`);
    }
    const existing = await this.adapter.findOne(meta, id);
    this.authorizeRecord(slug, 'edit', existing);
    if (!this.adapter.restore) {
      throw new Error('Adapter does not support restore');
    }
    const restored = await this.adapter.restore(meta, id);
    await this.auditMutation(slug, 'restore', {
      recordId: id,
      before: existing,
      after: restored,
    });
    return restored;
  }

  async bulkDelete(slug: string, ids: string[]) {
    const unique = [...new Set(ids.map(String).filter(Boolean))];
    let deleted = 0;
    for (const id of unique) {
      try {
        await this.delete(slug, id);
        deleted += 1;
      } catch {
        // skip unauthorized or missing rows
      }
    }
    await emitLoomAudit(this.auditConfig, {
      action: 'bulkDelete',
      resource: slug,
      recordIds: unique,
      userId: this.authUser()?.id,
      userEmail: this.authUser()?.email,
      requestId: currentRequestContext()?.requestId,
      meta: { deleted },
    });
    return { deleted, total: unique.length };
  }

  /**
   * Dispatch a custom bulk action declared on the resource class.
   * Built-in `delete` should use {@link bulkDelete}.
   */
  async runBulkAction(
    slug: string,
    action: string,
    ids: string[],
  ): Promise<{ ok: boolean; message?: string; affected?: number }> {
    const meta = this.meta(slug);
    const unique = [...new Set(ids.map(String).filter(Boolean))];
    const actionConfig = meta.actions.find(
      (item) => item.placement === 'bulk' && item.name === action,
    );
    if (actionConfig?.ability) {
      const ability = actionConfig.ability;
      if (
        ability === 'viewAny' ||
        ability === 'view' ||
        ability === 'create' ||
        ability === 'edit' ||
        ability === 'delete'
      ) {
        this.authorize(slug, ability);
      } else if (this.authEnabled) {
        const user = this.authUser();
        if (
          !user ||
          !(
            can(user, `${slug}:${ability}`) ||
            can(user, `${slug}:*`) ||
            can(user, '*') ||
            can(user, `*:${ability}`)
          )
        ) {
          throw new LoomAuthorizationError(`Missing permission ${slug}:${ability}`);
        }
      }
    }

    const inline = meta.bulkHandlers?.[action];
    if (inline) {
      const result = await inline(unique, {
        user: this.authUser(),
        slug,
        adapter: this.adapter,
        dataSource: this.options.dataSource,
      });
      return {
        ok: result?.ok !== false,
        message: result?.message,
        affected: result?.affected,
      };
    }

    const resourceClass = this.registry.requireClass(slug);
    if (typeof resourceClass.handleBulkAction !== 'function') {
      throw new Error(`Unknown bulk action "${action}"`);
    }
    const result = await resourceClass.handleBulkAction(action, unique, {
      user: this.authUser(),
    });
    return {
      ok: result?.ok !== false,
      message: result?.message,
      affected: result?.affected,
    };
  }

  /** Resolve all matching record ids for “select all in result set” bulk actions. */
  async listMatchingIds(slug: string, query: ListQuery, limit = 10_000): Promise<string[]> {
    this.authorize(slug, 'viewAny');
    const ids: string[] = [];
    let page = 1;
    const perPage = 100;
    while (ids.length < limit) {
      const result = await this.list(slug, { ...query, page, perPage });
      for (const item of result.items) {
        const id = item.id ?? item._id;
        if (id != null) ids.push(String(id));
        if (ids.length >= limit) break;
      }
      if (page * perPage >= result.total || result.items.length === 0) break;
      page += 1;
    }
    return ids;
  }

  async exportRecords(
    slug: string,
    query: ListQuery,
    format: ExportFormat,
  ): Promise<{ body: string; filename: string; contentType: string }> {
    this.authorizeExport(slug);
    const meta = this.meta(slug);
    const user = this.authUser();
    const policy = this.policyFor(slug);
    const scoped = {
      ...query,
      page: 1,
      perPage: 10_000,
      scope: this.mergedScope(slug, user, query.scope, policy),
    };
    const result = await this.adapter.list(meta, scoped);
    const columns = exportColumns(meta);
    const items = result.items.map((item) => this.sanitizeRecord(meta, item));
    const body = format === 'json' ? recordsToJson(items) : recordsToCsv(items, columns);
    await emitLoomAudit(this.auditConfig, {
      action: 'export',
      resource: slug,
      userId: user?.id,
      userEmail: user?.email,
      requestId: currentRequestContext()?.requestId,
      meta: { format, count: items.length },
    });
    return {
      body,
      filename: buildExportFilename(slug, format),
      contentType: format === 'json' ? 'application/json' : 'text/csv',
    };
  }

  async uploadMedia(
    slug: string,
    fieldName: string,
    input: { filename: string; mimeType: string; data: string },
  ): Promise<StoredMedia> {
    if (!this.storage) {
      throw new Error('Loom storage is not configured');
    }
    this.authorize(slug, 'create');
    const meta = this.meta(slug);
    const field = meta.fields.find((item) => item.name === fieldName);
    if (!field || (field.type !== 'file' && field.type !== 'image')) {
      throw new Error(`Unknown media field "${fieldName}"`);
    }
    const buffer = decodeBase64Upload(input.data);
    validateMediaUpload(
      { mimeType: input.mimeType, size: buffer.length },
      field.media ?? {},
      field.type,
    );
    return this.storage.store({
      buffer,
      filename: input.filename,
      mimeType: input.mimeType,
      directory: field.media?.disk ?? `${slug}/${fieldName}`,
    });
  }

  authorizeExport(slug: string): void {
    const user = this.authUser();
    if (!this.authEnabled) return;
    const abilities = this.abilitiesFor(slug);
    if (!canExport(user, this.authEnabled, slug, abilities.canViewAny)) {
      throw new LoomAuthorizationError(`Missing permission to export ${slug}`);
    }
  }

  authorizeImport(slug: string): void {
    const user = this.authUser();
    if (!this.authEnabled) return;
    const abilities = this.abilitiesFor(slug);
    if (!canImport(user, this.authEnabled, slug, abilities.canCreate)) {
      throw new LoomAuthorizationError(`Missing permission to import ${slug}`);
    }
  }

  async importRecords(
    slug: string,
    csv: string,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    this.authorizeImport(slug);
    const meta = this.meta(slug);
    const parsed = parseImportCsv(csv, meta);
    if (parsed.errors.length && parsed.rows.length === 0) {
      return { created: 0, failed: 0, errors: parsed.errors };
    }
    let created = 0;
    let failed = 0;
    const errors = [...parsed.errors];
    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i]!;
      try {
        await this.createRecord(slug, row);
        created += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row ${i + 2}: ${message}`);
        if (errors.length >= 25) {
          errors.push('…further errors omitted');
          break;
        }
      }
    }
    const user = this.authUser();
    await emitLoomAudit(this.auditConfig, {
      action: 'import',
      resource: slug,
      userId: user?.id,
      userEmail: user?.email,
      requestId: currentRequestContext()?.requestId,
      meta: { created, failed },
    });
    return { created, failed, errors };
  }

  parseExportFormat(value: string | undefined): ExportFormat {
    return parseExportFormat(value);
  }

  navigationGroups() {
    return this.registry.navigationGroups(this.authUser(), this.options.navigation);
  }

  menuContext(currentSlug?: string, pageTitle?: string) {
    return menuLayoutContext(
      this.navigationGroups(),
      this.basePath,
      currentSlug,
      pageTitle,
      this.options.navigation,
    );
  }

  get tenancyEnabled(): boolean {
    return this.authService.tenancyActive;
  }

  /** Sync fallback — prefer `shellCompanies()` when rendering the shell. */
  get companies(): LoomCompany[] {
    return this.options.companies ?? [];
  }

  async shellCompanies(): Promise<LoomCompany[]> {
    if (!this.tenancyEnabled) return this.companies;
    return this.authService.listSwitchableCompanies(this.authUser());
  }

  get currentCompanyId(): string | undefined {
    return this.authUser()?.companyId ?? this.options.currentCompanyId;
  }

  get canViewAllCompanies(): boolean {
    const user = this.authUser();
    return Boolean(this.tenancyEnabled && user && isAdmin(user));
  }

  get user() {
    const sessionUser = this.authUser();
    if (sessionUser) {
      return {
        name: sessionUser.name,
        email: sessionUser.email,
        avatar: sessionUser.avatar,
        role: sessionUser.roles?.[0] ?? sessionUser.role,
      };
    }
    return (
      this.options.user ?? {
        name: 'Admin User',
        email: 'admin@example.com',
      }
    );
  }

  userInitial(): string {
    const name = this.user.name?.trim();
    return name ? name.charAt(0).toUpperCase() : 'A';
  }

  abilitiesFor(slug: string, record?: Record<string, unknown>) {
    const user = this.authUser();
    if (!this.authEnabled || !user) {
      return {
        canViewAny: true,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      };
    }
    const resourceClass = this.registry.requireClass(slug);
    return {
      canViewAny: resourceClass.canViewAny?.(user) ?? true,
      canView: resourceClass.canView?.(user, record) ?? true,
      canCreate: resourceClass.canCreate?.(user) ?? true,
      canEdit: resourceClass.canEdit?.(user, record) ?? true,
      canDelete: resourceClass.canDelete?.(user, record) ?? true,
    };
  }

  recordTitle(meta: ResourceMeta, record: Record<string, unknown>): string {
    return (
      computeDisplayName(record, meta.recordTitleField) ||
      meta.singularLabel
    );
  }

  async relationOptionsForForm(meta: ResourceMeta): Promise<RelationOptionsMap> {
    const user = this.authUser();
    return buildRelationOptionsForForm(
      this.adapter,
      this.registry,
      meta,
      (resourceSlug) => {
        if (this.authEnabled) {
          try {
            this.authorize(resourceSlug, 'viewAny');
          } catch {
            return { equals: { id: '__loom_denied__' } };
          }
        }
        return this.mergedScope(
          resourceSlug,
          user,
          undefined,
          this.policyFor(resourceSlug),
        );
      },
      (relation) => shouldPreloadRelation(relation),
    );
  }

  async relationLabelsForRecords(
    meta: ResourceMeta,
    records: Record<string, unknown>[],
  ): Promise<RelationLabelMap> {
    return buildRelationLabelMap(this.adapter, this.registry, meta, records);
  }

  relationFieldContexts(meta: ResourceMeta): RelationFieldContextMap {
    return buildRelationFieldContexts(this.registry, meta);
  }

  async relationSearch(
    slug: string,
    fieldName: string,
    search?: string,
    limit = 15,
  ): Promise<RelationOption[]> {
    this.authorize(slug, 'viewAny');
    const meta = this.meta(slug);
    const field = meta.fields.find((item) => item.name === fieldName);
    const relation = field?.relation;
    if (!field || !relation) {
      throw new Error(`Unknown relation field "${fieldName}"`);
    }
    this.authorize(relation.resource, 'viewAny');
    const scope = this.mergedScope(
      relation.resource,
      this.authUser(),
      undefined,
      this.policyFor(relation.resource),
    );
    return searchRelationOptions(
      this.adapter,
      this.registry,
      relation,
      search,
      limit,
      scope,
    );
  }

  async relationQuickCreate(
    slug: string,
    fieldName: string,
    name: string,
  ): Promise<RelationOption> {
    this.authorize(slug, 'create');
    const meta = this.meta(slug);
    const field = meta.fields.find((item) => item.name === fieldName);
    if (field?.relation?.resource) {
      this.authorize(field.relation.resource, 'create');
    }
    return relationQuickCreate(this.adapter, this.registry, meta, fieldName, name);
  }

  async relationRecordSummary(
    resource: string,
    id: string,
    labelField?: string,
  ): Promise<RelationOption> {
    const record = await this.findOne(resource, id);
    const relatedMeta = this.meta(resource);
    const field = labelField ?? relatedMeta.recordTitleField ?? 'name';
    return {
      value: recordIdFrom(record),
      label: computeDisplayName(record, field) || String(record[field] ?? id),
    };
  }

  async createRecord(slug: string, data: Record<string, unknown>) {
    this.authorize(slug, 'create');
    const writable = await this.pickWritable(slug, data, 'create');
    this.syncUserCompanyConsistency(slug, writable);
    const policy = this.policyFor(slug);
    const ownerField = policy?.ownerField;
    const user = this.authUser();
    if (ownerField && user && writable[ownerField] == null) {
      writable[ownerField] = user.id;
    }
    this.stampCompany(slug, writable, user);
    const created = await this.adapter.create(this.meta(slug), writable);
    await this.auditMutation(slug, 'create', {
      recordId: recordIdFrom(created),
      before: null,
      after: created,
    });
    return created;
  }

  private authUser(): LoomAuthUser | null {
    return currentLoomUser();
  }

  private policyFor(slug: string): PolicyClass | undefined {
    const fromOptions = this.options.auth?.policies?.[slug];
    if (fromOptions) return fromOptions;
    const resourceClass = this.registry.resourceClass(slug) as
      | { policy?: PolicyClass }
      | undefined;
    return resourceClass?.policy;
  }

  private authorize(
    slug: string,
    ability: 'viewAny' | 'view' | 'create' | 'edit' | 'delete',
  ): void {
    setRequestContextField({ resource: slug, ability });
    if (!this.authEnabled) return;
    const user = this.authUser();
    const policy = this.policyFor(slug);
    if (policy && (ability === 'viewAny' || ability === 'create')) {
      assertPolicy(policy, ability, user, slug);
      return;
    }
    const resourceClass = this.registry.requireClass(slug);
    const method =
      ability === 'viewAny'
        ? resourceClass.canViewAny?.bind(resourceClass)
        : ability === 'create'
          ? resourceClass.canCreate?.bind(resourceClass)
          : undefined;
    assertCan(user, slug, ability, method ? (u) => Boolean(method(u)) : undefined);
  }

  private authorizeRecord(
    slug: string,
    ability: 'view' | 'edit' | 'delete',
    record: Record<string, unknown>,
  ): void {
    setRequestContextField({ resource: slug, ability });
    if (!this.authEnabled) return;
    const user = this.authUser();
    this.assertCompanyAccess(slug, user, record);
    const policy = this.policyFor(slug);
    if (policy) {
      assertPolicy(policy, ability, user, slug, record);
      return;
    }
    const resourceClass = this.registry.requireClass(slug);
    const method =
      ability === 'view'
        ? resourceClass.canView?.bind(resourceClass)
        : ability === 'edit'
          ? resourceClass.canEdit?.bind(resourceClass)
          : resourceClass.canDelete?.bind(resourceClass);
    assertCan(
      user,
      slug,
      ability,
      method ? (u) => Boolean(method(u, record)) : undefined,
    );
  }


  private mergedScope(
    slug: string,
    user: LoomAuthUser | null | undefined,
    queryScope: import('../core/policy.js').LoomQueryScope | undefined,
    policy: PolicyClass | undefined,
  ) {
    const policyScope = scopeList(policy, user, slug);
    const companyField = this.companyFieldFor(slug);
    const companyScope = companyField
      ? companyScopeForUser(user, companyField)
      : undefined;
    return mergeQueryScopes(queryScope, policyScope, companyScope);
  }

  private companyFieldFor(slug: string): string | null {
    if (!tenancyEnabled(this.options.auth?.tenancy)) return null;
    return resourceCompanyField(this.meta(slug), this.authService.tenancy);
  }

  private assertCompanyAccess(
    slug: string,
    user: LoomAuthUser | null | undefined,
    record: Record<string, unknown>,
  ): void {
    const companyField = this.companyFieldFor(slug);
    if (!companyField) return;
    if (
      !recordMatchesCompany(record, companyField, user?.companyId, user)
    ) {
      throw new LoomAuthorizationError(
        `You are not allowed to access this ${slug} record`,
      );
    }
  }

  private stampCompany(
    slug: string,
    writable: Record<string, unknown>,
    user: LoomAuthUser | null,
  ): void {
    const companyField = this.companyFieldFor(slug);
    if (!companyField || !user?.companyId) return;
    if (!isAdmin(user) || writable[companyField] == null) {
      writable[companyField] = user.companyId;
    }
  }

  private async pickWritable(
    slug: string,
    data: Record<string, unknown>,
    mode: 'create' | 'edit',
  ): Promise<Record<string, unknown>> {
    const meta = this.meta(slug);
    const allowed = new Set(
      meta.fields
        .filter((field) => !field.hiddenOnForm)
        .filter((field) => !(mode === 'edit' && field.createOnly))
        .map((field) => field.name),
    );
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_loom')) continue;
      if (!allowed.has(key)) continue;
      const field = meta.fields.find((item) => item.name === key);
      if (!field) continue;
      if ((value === '' || value === undefined) && field.type === 'relation' && !field.required) {
        const isMulti =
          field.relation?.kind === 'many2many' || field.relation?.kind === 'one2many';
        out[key] = isMulti ? [] : null;
        continue;
      }
      if (value === '' || value === undefined) continue;
      let coerced = coerceFieldValue(field.type, value);
      if (field.type === 'email' && typeof coerced === 'string') {
        coerced = coerced.trim().toLowerCase();
      }
      if (field.type === 'password' && typeof coerced === 'string') {
        coerced = await hashPassword(coerced);
      }
      if (field.relation && (field.relation.kind === 'many2many' || field.relation.kind === 'one2many')) {
        if (typeof coerced === 'string') {
          coerced = coerced
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        } else if (!Array.isArray(coerced)) {
          coerced = coerced == null || coerced === '' ? [] : [String(coerced)];
        } else {
          coerced = coerced.map((item) => String(item).trim()).filter(Boolean);
        }
      }
      out[key] = coerced;
    }
    for (const field of meta.fields) {
      if (!allowed.has(field.name) || field.type !== 'boolean') continue;
      if (!(field.name in out)) {
        out[field.name] = false;
      }
    }
    return out;
  }

  /**
   * Keep user default company (`companyId`) and memberships (`companyIds`) in sync:
   * - empty M2M stays `[]`
   * - default company is always included in memberships
   * - first membership is promoted when default is empty
   */
  private syncUserCompanyConsistency(
    slug: string,
    writable: Record<string, unknown>,
    existing?: Record<string, unknown>,
  ): void {
    const userSlug = this.options.auth?.userResource ?? 'users';
    if (slug !== userSlug) return;
    if (!tenancyEnabled(this.options.auth?.tenancy)) return;

    const tenancy = this.options.auth!.tenancy!;
    const homeField = tenancyCompanyField(tenancy);
    const membershipField = tenancyMembershipField(tenancy);
    if (!membershipField) return;
    if (!(homeField in writable) && !(membershipField in writable)) return;

    const homeRaw =
      homeField in writable ? writable[homeField] : existing?.[homeField];
    let home =
      homeRaw != null && homeRaw !== '' ? String(homeRaw) : undefined;

    let memberships: string[];
    if (membershipField in writable) {
      memberships = [
        ...new Set(relationIdsFromValue(writable[membershipField]).map(String)),
      ];
    } else {
      memberships = [
        ...new Set(relationIdsFromValue(existing?.[membershipField]).map(String)),
      ];
    }

    if (home && !memberships.includes(home)) {
      memberships = [...memberships, home];
    }
    if (!home && memberships.length > 0) {
      home = memberships[0];
    }
    if (home && memberships.length === 0) {
      memberships = [home];
    }

    writable[membershipField] = memberships;
    if (home) {
      writable[homeField] = home;
    } else if (homeField in writable) {
      writable[homeField] = null;
    }
  }

  private async auditMutation(
    slug: string,
    action: 'create' | 'update' | 'delete' | 'restore',
    input: {
      recordId: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const meta = this.meta(slug);
    const user = this.authUser();
    await emitLoomAudit(this.auditConfig, {
      action,
      resource: slug,
      recordId: input.recordId,
      userId: user?.id,
      userEmail: user?.email,
      requestId: currentRequestContext()?.requestId,
      before: redactAuditRecord(
        input.before,
        meta.fields,
        this.auditConfig?.redactFields,
      ),
      after: redactAuditRecord(
        input.after,
        meta.fields,
        this.auditConfig?.redactFields,
      ),
    });
  }
}

function coerceFieldValue(type: string, value: unknown): unknown {
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (type === 'boolean') {
    if (value === false || value === 'false' || value === '0' || value === 0) {
      return false;
    }
    return value === true || value === 'true' || value === 'on' || value === '1' || value === 1;
  }
  return value;
}

export { LoomAuthorizationError };
