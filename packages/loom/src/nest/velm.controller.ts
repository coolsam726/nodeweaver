import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { groupKanbanRecords } from '../core/resource.js';
import { buildListViews, showListViewSwitcher, type ListViewId, type ListViewQuery } from '../core/list-views.js';
import { buildPaginationContext, normalizeListQuery } from '../core/list-query.js';
import { buildBrandingCss } from '../core/branding.js';
import type { ResourceMeta, SortDirection } from '../core/types.js';
import { velmAdminCssPath, velmUiJsPath } from './paths.js';
import { VelmService } from './velm.service.js';
import { VelmViewService } from './velm-view.service.js';

export function createVelmController(basePath = '/admin'): new (...args: never[]) => object {
  const route = basePath.replace(/^\//, '') || 'admin';

  @Controller(route)
  class VelmController {
    constructor(
      private readonly velm: VelmService,
      private readonly views: VelmViewService,
    ) {}

    @Get('assets/branding.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    brandingCss(): string {
      return buildBrandingCss(this.velm.branding);
    }

    @Get('assets/velm-ui.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    velmUi(): string {
      return readFileSync(velmUiJsPath(), 'utf8');
    }

    @Get('assets/admin.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    adminCss(): string {
      return readFileSync(velmAdminCssPath(), 'utf8');
    }

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    dashboard(@Query('success') success?: string, @Query('error') error?: string): string {
      return this.views.render('dashboard', shellContext(this.velm, {
        pageTitle: 'Dashboard',
        pageSubtitle: 'Select an application to get started.',
        flash: flashFromQuery(success, error),
      }));
    }

    @Get(':resource/kanban')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async kanban(
      @Param('resource') resource: string,
      @Query('search') search?: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): Promise<string> {
      const meta = this.velm.meta(resource);
      if (!meta.kanban) {
        const result = await this.velm.list(resource, { page: 1, perPage: 100, search });
        return this.views.render('list', shellContext(this.velm, {
          currentSlug: resource,
          pageTitle: meta.label,
          pageSubtitle: `${result.total} records`,
          showCreateButton: true,
          resource: meta,
          result,
          query: { search },
          ...listViewContext(this.velm, meta, 'table', { search }),
        }));
      }
      const result = await this.velm.list(resource, {
        page: 1,
        perPage: meta.kanban.groupBy ? 500 : 100,
        search,
      });
      const columns = groupKanbanRecords(result.items, meta.kanban.groupBy);
      return this.views.render('kanban', shellContext(this.velm, {
        currentSlug: resource,
        pageTitle: meta.kanban.title ?? meta.label,
        pageSubtitle: 'Kanban view',
        showCreateButton: true,
        resource: meta,
        kanban: meta.kanban,
        columns,
        query: { search },
        flash: flashFromQuery(success, error),
        ...listViewContext(this.velm, meta, 'kanban', { search }),
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
      const meta = this.velm.meta(resource);
      const query = normalizeListQuery({ page, perPage, search, sort, direction });
      const result = await this.velm.list(resource, query);
      return this.views.render('list', shellContext(this.velm, {
        currentSlug: resource,
        pageTitle: meta.label,
        pageSubtitle: `${result.total} records`,
        showCreateButton: true,
        resource: meta,
        result,
        query,
        pagination: buildPaginationContext(this.velm.basePath, resource, query, result),
        flash: flashFromQuery(success, error),
        ...listViewContext(this.velm, meta, 'table', query),
      }));
    }

    @Get(':resource/create')
    @Header('Content-Type', 'text/html; charset=utf-8')
    createForm(
      @Param('resource') resource: string,
      @Query('embed') embed?: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): string {
      const meta = this.velm.meta(resource);
      const context = shellContext(this.velm, {
        currentSlug: resource,
        pageTitle: `Create ${meta.singularLabel}`,
        resource: meta,
        record: {},
        mode: 'create',
        readonly: false,
        embed: embed === '1',
        flash: flashFromQuery(success, error),
      });
      return this.views.render('form', context, embed === '1' ? { layout: 'bare' } : undefined);
    }

    @Post(':resource')
    @Redirect()
    async create(
      @Param('resource') resource: string,
      @Body() body: Record<string, unknown>,
    ): Promise<{ url: string; statusCode: number }> {
      try {
        await this.velm.create(resource, body);
        return {
          url: `${this.velm.basePath}/${resource}?success=created`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Create failed',
        );
        return {
          url: `${this.velm.basePath}/${resource}/create?error=${message}`,
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
      const meta = this.velm.meta(resource);
      const record = await this.velm.findOne(resource, id);
      const context = shellContext(this.velm, {
        currentSlug: resource,
        pageTitle: `Edit ${meta.singularLabel}`,
        resource: meta,
        record,
        recordTitle: this.velm.recordTitle(meta, record),
        mode: 'edit',
        id,
        readonly: false,
        embed: embed === '1',
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
      const meta = this.velm.meta(resource);
      const record = await this.velm.findOne(resource, id);
      const pageTitle = this.velm.recordTitle(meta, record);
      const context = shellContext(this.velm, {
        currentSlug: resource,
        pageTitle,
        showEditButton: !embed,
        showBackToList: !embed,
        resource: meta,
        record,
        recordTitle: pageTitle,
        id,
        embed: embed === '1',
        flash: flashFromQuery(success, error),
      });
      if (!meta.hasExplicitDetail) {
        return this.views.render(
          'form',
          { ...context, mode: 'view', readonly: true },
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
        await this.velm.update(resource, id, body);
        return {
          url: `${this.velm.basePath}/${resource}/${id}?success=updated`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Update failed',
        );
        return {
          url: `${this.velm.basePath}/${resource}/${id}/edit?error=${message}`,
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
        await this.velm.delete(resource, id);
        return {
          url: `${this.velm.basePath}/${resource}?success=deleted`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Delete failed',
        );
        return {
          url: `${this.velm.basePath}/${resource}?error=${message}`,
          statusCode: 302,
        };
      }
    }
  }

  return VelmController;
}

function listViewContext(
  velm: VelmService,
  meta: ResourceMeta,
  currentView: ListViewId,
  query: ListViewQuery = {},
) {
  const listViews = buildListViews(meta, velm.basePath, currentView, query);
  return {
    listViews,
    currentListView: currentView,
    showListViewSwitcher: showListViewSwitcher(listViews),
  };
}

function shellContext(
  velm: VelmService,
  extra: Record<string, unknown> & {
    currentSlug?: string;
    pageTitle?: string;
    resource?: ResourceMeta;
  },
): Record<string, unknown> {
  const pageTitle = (extra.pageTitle as string | undefined) ?? velm.panelTitle;
  const menu = velm.menuContext(extra.currentSlug, pageTitle);
  const companies = velm.companies;
  const currentCompanyId = velm.currentCompanyId;
  const currentCompany = companies.find((c) => c.id === currentCompanyId);
  return {
    title: pageTitle,
    pageTitle,
    panelTitle: velm.panelTitle,
    basePath: velm.basePath,
    branding: velm.branding,
    navGroups: velm.navigationGroups(),
    companies,
    currentCompanyId,
    currentCompanyName: currentCompany?.name,
    user: velm.user,
    userInitial: velm.userInitial(),
    ...menu,
    ...extra,
  };
}

function flashFromQuery(
  success?: string,
  error?: string,
): { type: 'success' | 'error'; message: string } | undefined {
  if (success) {
    const message =
      success === 'created'
        ? 'Record created.'
        : success === 'updated'
          ? 'Record updated.'
          : success === 'deleted'
            ? 'Record deleted.'
            : success;
    return { type: 'success', message };
  }
  if (error) {
    return { type: 'error', message: error };
  }
  return undefined;
}
