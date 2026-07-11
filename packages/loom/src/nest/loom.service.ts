import { Inject, Injectable } from '@nestjs/common';
import { computeDisplayName } from '../core/display-name.js';
import type { LoomAdapter } from '../adapters/adapter.js';
import { resolveBranding, type LoomBranding } from '../core/branding.js';
import { ResourceRegistry } from '../core/registry.js';
import { menuLayoutContext } from '../core/menu.js';
import { recordIdFrom } from '../adapters/adapter.js';
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
  RelationQuickCreateBlockedError,
} from '../core/relations.js';
import type { ListQuery, ResourceMeta, LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';

@Injectable()
export class LoomService {
  constructor(
    @Inject(LOOM_ADAPTER) private readonly adapter: LoomAdapter,
    @Inject(LOOM_REGISTRY) private readonly registry: ResourceRegistry,
    @Inject(LOOM_OPTIONS) private readonly options: LoomModuleOptions,
  ) {}

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
    return this.createRecord(slug, data);
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
    const meta = this.meta(slug);
    const field = meta.fields.find((item) => item.name === fieldName);
    const relation = field?.relation;
    if (!field || !relation || relation.kind !== 'many2one') {
      throw new Error(`Unknown relation field "${fieldName}"`);
    }
    return searchRelationOptions(this.adapter, this.registry, relation, search, limit);
  }

  async relationQuickCreate(
    slug: string,
    fieldName: string,
    name: string,
  ): Promise<RelationOption> {
    return relationQuickCreate(this.adapter, this.registry, this.meta(slug), fieldName, name);
  }

  async relationRecordSummary(
    resource: string,
    id: string,
    labelField?: string,
  ): Promise<RelationOption> {
    return relationRecordSummary(this.adapter, this.registry, resource, id, labelField);
  }

  createRecord(slug: string, data: Record<string, unknown>) {
    return this.adapter.create(this.meta(slug), this.pickWritable(slug, data, 'create'));
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
      if (key.startsWith('_loom')) continue;
      if (!allowed.has(key)) continue;
      const field = meta.fields.find((item) => item.name === key);
      if (!field) continue;
      if ((value === '' || value === undefined) && field.type === 'relation' && !field.required) {
        out[key] = null;
        continue;
      }
      if (value === '' || value === undefined) continue;
      out[key] = coerceFieldValue(field.type, value);
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
