import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { recordIdFrom } from '../adapters/adapter.js';
import { groupKanbanRecords } from '../core/resource.js';
import { buildListViews, showListViewSwitcher, type ListViewId, type ListViewQuery } from '../core/list-views.js';
import { buildPaginationContext, normalizeListQuery } from '../core/list-query.js';
import { buildBrandingCss } from '../core/branding.js';
import type { ResourceMeta, SortDirection } from '../core/types.js';
import { flashFromQuery } from '../core/flash.js';
import { loomAdminCssPath, loomUiJsPath } from './paths.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';
import { RelationQuickCreateBlockedError } from '../core/relations.js';

export function createLoomController(basePath = '/admin'): new (...args: never[]) => object {
  const route = basePath.replace(/^\//, '') || 'admin';

  @Controller(route)
  class LoomController {
    constructor(
      private readonly loom: LoomService,
      private readonly views: LoomViewService,
    ) {}

    @Get('assets/branding.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    brandingCss(): string {
      return buildBrandingCss(this.loom.branding);
    }

    @Get('assets/loom-ui.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    loomUi(): string {
      return readFileSync(loomUiJsPath(), 'utf8');
    }

    @Get('assets/admin.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    adminCss(): string {
      return readFileSync(loomAdminCssPath(), 'utf8');
    }

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    dashboard(@Query('success') success?: string, @Query('error') error?: string): string {
      return this.views.render('dashboard', shellContext(this.loom, {
        pageTitle: 'Dashboard',
        pageSubtitle: 'Select an application to get started.',
        flash: flashFromQuery(success, error),
      }));
    }

    @Get(':resource/kanban')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async kanban(
      @Param('resource') resource: string,
      @Query('page') page = '1',
      @Query('perPage') perPage = '15',
      @Query('search') search?: string,
      @Query('sort') sort?: string,
      @Query('direction') direction?: SortDirection,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): Promise<string> {
      const meta = this.loom.meta(resource);
      const query = normalizeListQuery({ page, perPage, search, sort, direction });
      if (!meta.kanban) {
        const result = await this.loom.list(resource, query);
        const relationLabels = await this.loom.relationLabelsForRecords(meta, result.items);
        return this.views.render('list', shellContext(this.loom, {
          currentSlug: resource,
          pageTitle: meta.label,
          pageSubtitle: `${result.total} records`,
          showCreateButton: true,
          resource: meta,
          result,
          query,
          relationLabels,
          pagination: buildPaginationContext(this.loom.basePath, resource, query, result),
          flash: flashFromQuery(success, error),
          ...listViewContext(this.loom, meta, 'table', query),
        }));
      }
      const result = await this.loom.list(resource, query);
      const relationLabels = await this.loom.relationLabelsForRecords(meta, result.items);
      const columns = groupKanbanRecords(result.items, meta.kanban.groupBy);
      return this.views.render('kanban', shellContext(this.loom, {
        currentSlug: resource,
        pageTitle: meta.kanban.title ?? meta.label,
        pageSubtitle: `${result.total} records`,
        showCreateButton: true,
        resource: meta,
        result,
        kanban: meta.kanban,
        columns,
        relationLabels,
        query,
        pagination: buildPaginationContext(this.loom.basePath, resource, query, result, 'kanban'),
        flash: flashFromQuery(success, error),
        ...listViewContext(this.loom, meta, 'kanban', query),
      }));
    }

    @Get(':resource')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async list(
      @Param('resource') resource: string,
      @Query('page') page = '1',
      @Query('perPage') perPage = '15',
      @Query('search') search?: string,
      @Query('sort') sort?: string,
      @Query('direction') direction?: SortDirection,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): Promise<string> {
      const meta = this.loom.meta(resource);
      const query = normalizeListQuery({ page, perPage, search, sort, direction });
      const result = await this.loom.list(resource, query);
      const relationLabels = await this.loom.relationLabelsForRecords(meta, result.items);
      return this.views.render('list', shellContext(this.loom, {
        currentSlug: resource,
        pageTitle: meta.label,
        pageSubtitle: `${result.total} records`,
        showCreateButton: true,
        resource: meta,
        result,
        query,
        relationLabels,
        pagination: buildPaginationContext(this.loom.basePath, resource, query, result),
        flash: flashFromQuery(success, error),
        ...listViewContext(this.loom, meta, 'table', query),
      }));
    }

    @Get(':resource/create')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async createForm(
      @Param('resource') resource: string,
      @Query('embed') embed?: string,
      @Query('name') prefilledName?: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): Promise<string> {
      const meta = this.loom.meta(resource);
      const relationOptions = await this.loom.relationOptionsForForm(meta);
      const record: Record<string, unknown> = {};
      if (prefilledName?.trim()) {
        const titleField =
          meta.recordTitleField && meta.recordTitleField !== 'displayName'
            ? meta.recordTitleField
            : 'name';
        record[titleField] = prefilledName.trim();
      }
      const context = shellContext(this.loom, {
        currentSlug: resource,
        pageTitle: `Create ${meta.singularLabel}`,
        resource: meta,
        record,
        mode: 'create',
        readonly: false,
        embed: embed === '1',
        relationOptions,
        relationFieldContexts: this.loom.relationFieldContexts(meta),
        flash: flashFromQuery(success, error),
      });
      return this.views.render('form', context, embed === '1' ? { layout: 'bare' } : undefined);
    }

    @Get(':resource/relation-search')
    @Header('Content-Type', 'application/json; charset=utf-8')
    async relationSearch(
      @Param('resource') resource: string,
      @Query('field') field: string,
      @Query('q') q?: string,
      @Query('limit') limit = '15',
    ): Promise<string> {
      try {
        const results = await this.loom.relationSearch(
          resource,
          field,
          q,
          Math.min(100, Math.max(1, Number(limit) || 15)),
        );
        return JSON.stringify({
          results: results.map((item) => ({ id: item.value, label: item.label })),
        });
      } catch (error) {
        throw new HttpException(
          error instanceof Error ? error.message : 'Search failed',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    @Post(':resource/relation-quick-create')
    @Header('Content-Type', 'application/json; charset=utf-8')
    async relationQuickCreate(
      @Param('resource') resource: string,
      @Body() body: { field?: string; name?: string },
    ): Promise<string> {
      try {
        const item = await this.loom.relationQuickCreate(
          resource,
          body.field ?? '',
          body.name ?? '',
        );
        return JSON.stringify({ id: item.value, label: item.label });
      } catch (error) {
        if (error instanceof RelationQuickCreateBlockedError) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
        throw new HttpException(
          error instanceof Error ? error.message : 'Create failed',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    @Get(':resource/:id/summary')
    @Header('Content-Type', 'application/json; charset=utf-8')
    async recordSummary(
      @Param('resource') resource: string,
      @Param('id') id: string,
    ): Promise<string> {
      try {
        const item = await this.loom.relationRecordSummary(resource, id);
        return JSON.stringify({ id: item.value, label: item.label });
      } catch (error) {
        throw new HttpException(
          error instanceof Error ? error.message : 'Record not found',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    @Post(':resource')
    @Redirect()
    async create(
      @Param('resource') resource: string,
      @Body() body: Record<string, unknown>,
    ): Promise<{ url: string; statusCode: number }> {
      try {
        const created = await this.loom.createRecord(resource, body);
        const id = recordIdFrom(created);
        if (body._loom_embed === '1' && id) {
          return {
            url: `${this.loom.basePath}/${resource}/${id}?success=created&embed=1`,
            statusCode: 302,
          };
        }
        return {
          url: `${this.loom.basePath}/${resource}?success=created`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Create failed',
        );
        if (body._loom_embed === '1') {
          return {
            url: `${this.loom.basePath}/${resource}/create?error=${message}&embed=1`,
            statusCode: 302,
          };
        }
        return {
          url: `${this.loom.basePath}/${resource}/create?error=${message}`,
          statusCode: 302,
        };
      }
    }

    @Get(':resource/:id/edit')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async editForm(
      @Param('resource') resource: string,
      @Param('id') id: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
      @Query('embed') embed?: string,
    ): Promise<string> {
      const meta = this.loom.meta(resource);
      const record = await this.loom.findOne(resource, id);
      const [relationOptions, relationLabels] = await Promise.all([
        this.loom.relationOptionsForForm(meta),
        this.loom.relationLabelsForRecords(meta, [record]),
      ]);
      const context = shellContext(this.loom, {
        currentSlug: resource,
        pageTitle: `Edit ${meta.singularLabel}`,
        resource: meta,
        record,
        recordTitle: this.loom.recordTitle(meta, record),
        mode: 'edit',
        id,
        readonly: false,
        embed: embed === '1',
        relationOptions,
        relationFieldContexts: this.loom.relationFieldContexts(meta),
        relationLabels,
        flash: flashFromQuery(success, error),
      });
      return this.views.render('form', context, embed === '1' ? { layout: 'bare' } : undefined);
    }

    @Get(':resource/:id')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async detail(
      @Param('resource') resource: string,
      @Param('id') id: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
      @Query('embed') embed?: string,
    ): Promise<string> {
      const meta = this.loom.meta(resource);
      const record = await this.loom.findOne(resource, id);
      const relationLabels = await this.loom.relationLabelsForRecords(meta, [record]);
      const pageTitle = this.loom.recordTitle(meta, record);
      const context = shellContext(this.loom, {
        currentSlug: resource,
        pageTitle,
        showEditButton: !embed,
        showBackToList: !embed,
        resource: meta,
        record,
        recordTitle: pageTitle,
        id,
        embed: embed === '1',
        relationLabels,
        flash: flashFromQuery(success, error),
      });
      if (!meta.hasExplicitDetail) {
        const relationOptions = await this.loom.relationOptionsForForm(meta);
        return this.views.render(
          'form',
          { ...context, mode: 'view', readonly: true, relationOptions },
          embed === '1' ? { layout: 'bare' } : undefined,
        );
      }
      return this.views.render('detail', context, embed === '1' ? { layout: 'bare' } : undefined);
    }

    @Post(':resource/:id')
    @Redirect()
    async update(
      @Param('resource') resource: string,
      @Param('id') id: string,
      @Body() body: Record<string, unknown>,
    ): Promise<{ url: string; statusCode: number }> {
      try {
        await this.loom.update(resource, id, body);
        if (body._loom_embed === '1') {
          return {
            url: `${this.loom.basePath}/${resource}?success=updated`,
            statusCode: 302,
          };
        }
        return {
          url: `${this.loom.basePath}/${resource}?success=updated`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Update failed',
        );
        if (body._loom_embed === '1') {
          return {
            url: `${this.loom.basePath}/${resource}/${id}/edit?error=${message}&embed=1`,
            statusCode: 302,
          };
        }
        return {
          url: `${this.loom.basePath}/${resource}/${id}/edit?error=${message}`,
          statusCode: 302,
        };
      }
    }

    @Post(':resource/:id/delete')
    @Redirect()
    async remove(
      @Param('resource') resource: string,
      @Param('id') id: string,
    ): Promise<{ url: string; statusCode: number }> {
      try {
        await this.loom.delete(resource, id);
        return {
          url: `${this.loom.basePath}/${resource}?success=deleted`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Delete failed',
        );
        return {
          url: `${this.loom.basePath}/${resource}?error=${message}`,
          statusCode: 302,
        };
      }
    }
  }

  return LoomController;
}

function listViewContext(
  loom: LoomService,
  meta: ResourceMeta,
  currentView: ListViewId,
  query: ListViewQuery = {},
) {
  const listViews = buildListViews(meta, loom.basePath, currentView, query);
  return {
    listViews,
    currentListView: currentView,
    showListViewSwitcher: showListViewSwitcher(listViews),
  };
}

function shellContext(
  loom: LoomService,
  extra: Record<string, unknown> & {
    currentSlug?: string;
    pageTitle?: string;
    resource?: ResourceMeta;
  },
): Record<string, unknown> {
  const pageTitle = (extra.pageTitle as string | undefined) ?? loom.panelTitle;
  const menu = loom.menuContext(extra.currentSlug, pageTitle);
  const companies = loom.companies;
  const currentCompanyId = loom.currentCompanyId;
  const currentCompany = companies.find((c) => c.id === currentCompanyId);
  return {
    title: pageTitle,
    pageTitle,
    panelTitle: loom.panelTitle,
    basePath: loom.basePath,
    branding: loom.branding,
    navGroups: loom.navigationGroups(),
    companies,
    currentCompanyId,
    currentCompanyName: currentCompany?.name,
    user: loom.user,
    userInitial: loom.userInitial(),
    ...menu,
    ...extra,
  };
}
