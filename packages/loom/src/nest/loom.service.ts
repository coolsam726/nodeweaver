import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { computeDisplayName } from '../core/display-name.js';
import type { LoomAdapter } from '../adapters/adapter.js';
import { resolveBranding, type LoomBranding } from '../core/branding.js';
import { ResourceRegistry } from '../core/registry.js';
import { menuLayoutContext } from '../core/menu.js';
import {
  buildRelationFieldContexts,
  buildRelationLabelMap,
  buildRelationOptionsForForm,
  relationQuickCreate,
  relationRecordSummary,
  searchRelationOptions,
  type RelationFieldContextMap,
  type RelationLabelMap,
  type RelationOption,
  type RelationOptionsMap,
} from '../core/relations.js';
import type { ListQuery, ResourceMeta, LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';
import {
  currentCsrfToken,
  currentLoomUser,
  hashPassword,
  type LoomAuthUser,
} from '../core/auth.js';
import {
  LoomAuthorizationError,
  assertCan,
} from '../core/abilities.js';
import {
  assertPolicy,
  scopeList,
  type PolicyClass,
} from '../core/policy.js';
import { LoomAuthService } from './loom-auth.service.js';

@Injectable()
export class LoomService {
  constructor(
    @Inject(LOOM_ADAPTER) private readonly adapter: LoomAdapter,
    @Inject(LOOM_REGISTRY) private readonly registry: ResourceRegistry,
    @Inject(LOOM_OPTIONS) private readonly options: LoomModuleOptions,
    @Inject(forwardRef(() => LoomAuthService))
    private readonly authService: LoomAuthService,
  ) {}

  get csrfToken(): string {
    return currentCsrfToken();
  }
  get basePath(): string {
    return this.options.basePath ?? '/admin';
  }

  get panelTitle(): string {
    return this.branding.brandName;
  }

  get branding(): LoomBranding {
    const company = this.companies.find((item) => item.id === this.currentCompanyId);
    return resolveBranding(this.options.branding, company?.branding, this.options.title);
  }

  get authEnabled(): boolean {
    return Boolean(this.options.auth?.secret);
  }

  get apiEnabled(): boolean {
    const api = this.options.api;
    if (api === false) return false;
    if (api === true || api === undefined) return true;
    return api.enabled !== false;
  }

  get apiPrefix(): string {
    const api = this.options.api;
    if (api && typeof api === 'object' && api.prefix) {
      return api.prefix.replace(/^\//, '').replace(/\/$/, '');
    }
    return 'api/loom';
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
    const scoped = {
      ...query,
      scope: scopeList(policy, user, slug) ?? query.scope,
    };
    return this.adapter.list(this.meta(slug), scoped);
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
    const updated = await this.adapter.update(this.meta(slug), id, writable);
    const userSlug = this.options.auth?.userResource ?? 'users';
    const passwordField = this.options.auth?.passwordField ?? 'password';
    if (slug === userSlug && writable[passwordField] != null) {
      await this.authService.bumpSessionVersion(id);
    }
    return updated;
  }

  async delete(slug: string, id: string) {
    const existing = await this.adapter.findOne(this.meta(slug), id);
    this.authorizeRecord(slug, 'delete', existing);
    return this.adapter.delete(this.meta(slug), id);
  }

  navigationGroups() {
    return this.registry.navigationGroups(this.authUser());
  }

  menuContext(currentSlug?: string, pageTitle?: string) {
    return menuLayoutContext(
      this.navigationGroups(),
      this.basePath,
      currentSlug,
      pageTitle,
    );
  }

  get companies() {
    return this.options.companies ?? [];
  }

  get currentCompanyId() {
    return this.authUser()?.companyId ?? this.options.currentCompanyId;
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
    return buildRelationOptionsForForm(this.adapter, this.registry, meta);
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
    return searchRelationOptions(this.adapter, this.registry, relation, search, limit);
  }

  async relationQuickCreate(
    slug: string,
    fieldName: string,
    name: string,
  ): Promise<RelationOption> {
    this.authorize(slug, 'create');
    return relationQuickCreate(this.adapter, this.registry, this.meta(slug), fieldName, name);
  }

  async relationRecordSummary(
    resource: string,
    id: string,
    labelField?: string,
  ): Promise<RelationOption> {
    this.authorize(resource, 'view');
    return relationRecordSummary(this.adapter, this.registry, resource, id, labelField);
  }

  async createRecord(slug: string, data: Record<string, unknown>) {
    this.authorize(slug, 'create');
    const writable = await this.pickWritable(slug, data, 'create');
    const policy = this.policyFor(slug);
    const ownerField = policy?.ownerField;
    const user = this.authUser();
    if (ownerField && user && writable[ownerField] == null) {
      writable[ownerField] = user.id;
    }
    return this.adapter.create(this.meta(slug), writable);
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
    if (!this.authEnabled) return;
    const user = this.authUser();
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
        out[key] = null;
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
