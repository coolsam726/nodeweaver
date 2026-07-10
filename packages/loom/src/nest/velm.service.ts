import { Inject, Injectable } from '@nestjs/common';
import type { VelmAdapter } from '../adapters/adapter.js';
import { resolveBranding, type VelmBranding } from '../core/branding.js';
import { ResourceRegistry } from '../core/registry.js';
import { menuLayoutContext } from '../core/menu.js';
import type { ListQuery, ResourceMeta, VelmModuleOptions } from '../core/types.js';
import { VELM_ADAPTER, VELM_OPTIONS, VELM_REGISTRY } from '../core/types.js';

@Injectable()
export class VelmService {
  constructor(
    @Inject(VELM_ADAPTER) private readonly adapter: VelmAdapter,
    @Inject(VELM_REGISTRY) private readonly registry: ResourceRegistry,
    @Inject(VELM_OPTIONS) private readonly options: VelmModuleOptions,
  ) {}

  get basePath(): string {
    return this.options.basePath ?? '/admin';
  }

  get panelTitle(): string {
    return this.branding.brandName;
  }

  get branding(): VelmBranding {
    const company = this.companies.find((item) => item.id === this.currentCompanyId);
    return resolveBranding(this.options.branding, company?.branding, this.options.title);
  }

  resources(): ResourceMeta[] {
    return this.registry.all();
  }

  meta(slug: string): ResourceMeta {
    return this.registry.require(slug);
  }

  list(slug: string, query: ListQuery) {
    return this.adapter.list(this.meta(slug), query);
  }

  findOne(slug: string, id: string) {
    return this.adapter.findOne(this.meta(slug), id);
  }

  create(slug: string, data: Record<string, unknown>) {
    return this.adapter.create(this.meta(slug), this.pickWritable(slug, data, 'create'));
  }

  update(slug: string, id: string, data: Record<string, unknown>) {
    return this.adapter.update(this.meta(slug), id, this.pickWritable(slug, data, 'edit'));
  }

  delete(slug: string, id: string) {
    return this.adapter.delete(this.meta(slug), id);
  }

  navigationGroups() {
    return this.registry.navigationGroups();
  }

  menuContext(currentSlug?: string, pageTitle?: string) {
    return menuLayoutContext(
      this.registry.navigationGroups(),
      this.basePath,
      currentSlug,
      pageTitle,
    );
  }

  get companies() {
    return this.options.companies ?? [];
  }

  get currentCompanyId() {
    return this.options.currentCompanyId;
  }

  get user() {
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

  recordTitle(meta: ResourceMeta, record: Record<string, unknown>): string {
    const field = meta.recordTitleField ?? 'name';
    const value = record[field] ?? record.name ?? record.title ?? record.email;
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    const id = record.id ?? record._id;
    return id ? `#${id}` : meta.singularLabel;
  }

  private pickWritable(
    slug: string,
    data: Record<string, unknown>,
    mode: 'create' | 'edit',
  ): Record<string, unknown> {
    const meta = this.meta(slug);
    const allowed = new Set(
      meta.fields
        .filter((field) => !field.hiddenOnForm)
        .filter((field) => !(mode === 'edit' && field.createOnly))
        .map((field) => field.name),
    );
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!allowed.has(key)) continue;
      if (value === '' || value === undefined) continue;
      const field = meta.fields.find((item) => item.name === key);
      if (!field) continue;
      out[key] = coerceFieldValue(field.type, value);
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
    return value === true || value === 'true' || value === 'on' || value === '1';
  }
  return value;
}
