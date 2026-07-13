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
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordIdFrom } from '../adapters/adapter.js';
import { resolveListActions, resourceHasMediaFields } from '../core/list-actions.js';
import { groupKanbanRecords } from '../core/resource.js';
import { buildListViews, showListViewSwitcher, type ListViewId, type ListViewQuery } from '../core/list-views.js';
import { buildPaginationContext, normalizeListQuery } from '../core/list-query.js';
import { buildBrandingCss } from '../core/branding.js';
import type { ResourceMeta, SortDirection } from '../core/types.js';
import { flashFromQuery } from '../core/flash.js';
import { currentRequestContext } from '../core/request-context.js';
import { LoomAuthorizationError } from '../core/abilities.js';
import { LoginRateLimitError } from '../core/login-rate-limit.js';
import { loomAdminCssPath, loomAlpineJsPath, loomUiJsPath } from './paths.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';
import { LoomAuthService } from './loom-auth.service.js';
import { LoomAuthInterceptor, setResponseCookie, setResponseCookies } from './loom-auth.interceptor.js';
import { RelationQuickCreateBlockedError } from '../core/relations.js';
import { clientIpFromRequest } from './request-ip.js';
import { LoomCsrfError } from '../core/csrf.js';
import { currentCsrfToken, currentLoomUser } from '../core/auth.js';

export function createLoomController(basePath = '/admin'): new (...args: never[]) => object {
  const route = basePath.replace(/^\//, '') || 'admin';

  @Controller(route)
  @UseInterceptors(LoomAuthInterceptor)
  class LoomController {
    constructor(
      private readonly loom: LoomService,
      private readonly views: LoomViewService,
      private readonly auth: LoomAuthService,
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

    @Get('assets/alpine.min.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'public, max-age=86400')
    alpineJs(): string {
      return readFileSync(loomAlpineJsPath(), 'utf8');
    }

    @Get('assets/admin.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    adminCss(): string {
      return readFileSync(loomAdminCssPath(), 'utf8');
    }

    @Get('login')
    @Header('Content-Type', 'text/html; charset=utf-8')
    loginForm(
      @Query('error') error?: string,
      @Query('success') success?: string,
      @Query('redirect') redirectTo?: string,
    ): string {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      return this.views.render(
        'login',
        {
          pageTitle: 'Sign in',
          panelTitle: this.loom.panelTitle,
          basePath: this.loom.basePath,
          branding: this.loom.branding,
          redirect: redirectTo || this.loom.basePath,
          flash: flashFromQuery(success, error),
          csrfToken: currentCsrfToken(),
          passwordResetEnabled: this.auth.passwordResetEnabled,
        },
        { layout: 'bare' },
      );
    }

    @Get('forgot-password')
    @Header('Content-Type', 'text/html; charset=utf-8')
    forgotPasswordForm(
      @Query('error') error?: string,
      @Query('success') success?: string,
    ): string {
      if (!this.auth.enabled || !this.auth.passwordResetEnabled) {
        throw new HttpException('Password reset is not available', HttpStatus.NOT_FOUND);
      }
      return this.views.render(
        'forgot-password',
        {
          pageTitle: 'Forgot password',
          panelTitle: this.loom.panelTitle,
          basePath: this.loom.basePath,
          branding: this.loom.branding,
          flash: flashFromQuery(success, error),
          csrfToken: currentCsrfToken(),
        },
        { layout: 'bare' },
      );
    }

    @Post('forgot-password')
    async forgotPassword(
      @Req() req: {
        ip?: string;
        headers?: Record<string, unknown>;
        socket?: { remoteAddress?: string };
        protocol?: string;
      },
      @Body() body: { email?: string },
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
        status?: (code: number) => { send?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      if (!this.auth.enabled || !this.auth.passwordResetEnabled) {
        throw new HttpException('Password reset is not available', HttpStatus.NOT_FOUND);
      }
      try {
        const host = String(req.headers?.host ?? '').split(',')[0]?.trim();
        const proto = String(
          (req.headers?.['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
            req.protocol ||
            'http',
        );
        const resetBaseUrl = host
          ? `${proto}://${host}${this.loom.basePath}`
          : this.loom.basePath;
        const result = await this.auth.requestPasswordReset(String(body.email ?? ''), {
          ip: clientIpFromRequest(req),
          resetBaseUrl,
        });
        sendRedirect(
          res,
          `${this.loom.basePath}/forgot-password?success=${encodeURIComponent(result.message)}`,
        );
      } catch (error) {
        if (error instanceof LoginRateLimitError) {
          sendRedirect(
            res,
            `${this.loom.basePath}/forgot-password?error=${encodeURIComponent(error.message)}`,
          );
          return;
        }
        if (error instanceof LoomCsrfError) {
          sendRedirect(
            res,
            `${this.loom.basePath}/forgot-password?error=${encodeURIComponent(error.message)}`,
          );
          return;
        }
        throw error;
      }
    }

    @Get('reset-password')
    @Header('Content-Type', 'text/html; charset=utf-8')
    resetPasswordForm(
      @Query('token') token?: string,
      @Query('error') error?: string,
    ): string {
      if (!this.auth.enabled || !this.auth.passwordResetEnabled) {
        throw new HttpException('Password reset is not available', HttpStatus.NOT_FOUND);
      }
      const raw = String(token ?? '');
      const valid = Boolean(raw && this.auth.peekPasswordResetToken(raw));
      return this.views.render(
        'reset-password',
        {
          pageTitle: 'Reset password',
          panelTitle: this.loom.panelTitle,
          basePath: this.loom.basePath,
          branding: this.loom.branding,
          token: raw,
          tokenValid: valid,
          flash: flashFromQuery(undefined, error),
          csrfToken: currentCsrfToken(),
        },
        { layout: 'bare' },
      );
    }

    @Post('reset-password')
    async resetPassword(
      @Body() body: { token?: string; password?: string; passwordConfirm?: string },
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
        status?: (code: number) => { send?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      if (!this.auth.enabled || !this.auth.passwordResetEnabled) {
        throw new HttpException('Password reset is not available', HttpStatus.NOT_FOUND);
      }
      const token = String(body.token ?? '');
      const password = String(body.password ?? '');
      const confirm = String(body.passwordConfirm ?? '');
      if (password !== confirm) {
        sendRedirect(
          res,
          `${this.loom.basePath}/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent('Passwords do not match')}`,
        );
        return;
      }
      const result = await this.auth.resetPasswordWithToken(token, password);
      if (!result.ok) {
        sendRedirect(
          res,
          `${this.loom.basePath}/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.message)}`,
        );
        return;
      }
      sendRedirect(
        res,
        `${this.loom.basePath}/login?success=${encodeURIComponent('Password updated. Sign in with your new password.')}`,
      );
    }

    @Post('login')
    async login(
      @Req() req: { ip?: string; headers?: Record<string, unknown>; socket?: { remoteAddress?: string } },
      @Body() body: { email?: string; password?: string; redirect?: string },
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
        status?: (code: number) => { send?: (body?: unknown) => unknown; header?: (n: string, v: string) => unknown };
        send?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const redirectTo = safeRedirect(body.redirect, this.loom.basePath);
      try {
        const result = await this.auth.authenticate(email, password, {
          ip: clientIpFromRequest(req),
        });
        if (!result) {
          const message = encodeURIComponent('Invalid email or password');
          sendRedirect(res, `${this.loom.basePath}/login?error=${message}&redirect=${encodeURIComponent(redirectTo)}`);
          return;
        }
        setResponseCookies(res, result.cookies);
        sendRedirect(res, redirectTo);
      } catch (error) {
        if (error instanceof LoginRateLimitError) {
          const message = encodeURIComponent(error.message);
          sendRedirect(
            res,
            `${this.loom.basePath}/login?error=${message}&redirect=${encodeURIComponent(redirectTo)}`,
          );
          return;
        }
        if (error instanceof LoomCsrfError) {
          const message = encodeURIComponent(error.message);
          sendRedirect(
            res,
            `${this.loom.basePath}/login?error=${message}&redirect=${encodeURIComponent(redirectTo)}`,
          );
          return;
        }
        throw error;
      }
    }

    @Post('logout')
    async logout(
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        appendHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
        status?: (code: number) => { send?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      const user = currentLoomUser();
      if (user) {
        await this.auth.bumpSessionVersion(user.id);
      }
      setResponseCookies(res, this.auth.clearSessionCookies());
      sendRedirect(res, this.auth.loginPath);
    }

    @Post('company/switch')
    async switchCompany(
      @Req() req: {
        headers?: Record<string, unknown>;
      },
      @Body() body: Record<string, unknown>,
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        appendHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
        status?: (code: number) => { send?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        statusCode?: number;
      },
      @Query('redirect') redirect?: string,
    ): Promise<void> {
      const user = currentLoomUser();
      if (!user || !this.auth.tenancyActive) {
        sendRedirect(res, this.loom.basePath);
        return;
      }
      const raw = body.companyId;
      const companyId =
        raw === undefined || raw === null
          ? ''
          : String(raw);
      const redirectTo = resolveCompanySwitchRedirect(
        body.redirect ?? redirect,
        req.headers?.referer ?? req.headers?.Referer,
        this.loom.basePath,
      );
      try {
        const result = await this.auth.switchCompany(user, companyId);
        setResponseCookies(res, result.cookies);
        sendRedirect(res, redirectTo);
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Could not switch company',
        );
        const sep = redirectTo.includes('?') ? '&' : '?';
        sendRedirect(res, `${redirectTo}${sep}error=${message}`);
      }
    }

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    async dashboard(@Query('success') success?: string, @Query('error') error?: string): Promise<string> {
      return this.views.render('dashboard', await shellContext(this.loom, {
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
      try {
        const meta = this.loom.meta(resource);
        const abilities = this.loom.abilitiesFor(resource);
        const query = normalizeListQuery({ page, perPage, search, sort, direction });
        if (!meta.kanban) {
          const result = await this.loom.list(resource, query);
          const relationLabels = await this.loom.relationLabelsForRecords(meta, result.items);
          return this.views.render('list', await shellContext(this.loom, {
            currentSlug: resource,
            pageTitle: meta.label,
            pageSubtitle: `${result.total} records`,
            showCreateButton: abilities.canCreate,
            resource: meta,
            abilities,
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
        return this.views.render('kanban', await shellContext(this.loom, {
          currentSlug: resource,
          pageTitle: meta.kanban.title ?? meta.label,
          pageSubtitle: `${result.total} records`,
          showCreateButton: abilities.canCreate,
          resource: meta,
          abilities,
          result,
          kanban: meta.kanban,
          columns,
          relationLabels,
          query,
          pagination: buildPaginationContext(this.loom.basePath, resource, query, result, 'kanban'),
          flash: flashFromQuery(success, error),
          ...listViewContext(this.loom, meta, 'kanban', query),
        }));
      } catch (error) {
        throw mapAuthError(error);
      }
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
      @Query('trashed') trashed?: string,
      @Query('success') success?: string,
      @Query('error') error?: string,
    ): Promise<string> {
      try {
        const meta = this.loom.meta(resource);
        const abilities = this.loom.abilitiesFor(resource);
        const query = normalizeListQuery({ page, perPage, search, sort, direction, trashed });
        const result = await this.loom.list(resource, query);
        const relationLabels = await this.loom.relationLabelsForRecords(meta, result.items);
        const listActions = resolveListActions(
          meta,
          this.loom.basePath,
          currentLoomUser(),
          this.loom.authEnabled,
          abilities,
        );
        return this.views.render('list', await shellContext(this.loom, {
          currentSlug: resource,
          pageTitle: meta.label,
          pageSubtitle: `${result.total} records`,
          showCreateButton: abilities.canCreate && query.trashed !== 'only',
          resource: meta,
          abilities,
          result,
          query,
          trashed: query.trashed === 'only',
          softDeleteEnabled: Boolean(meta.softDelete),
          relationLabels,
          pagination: buildPaginationContext(this.loom.basePath, resource, query, result),
          flash: flashFromQuery(success, error),
          ...listActions,
          ...listViewContext(this.loom, meta, 'table', query),
        }));
      } catch (error) {
        throw mapAuthError(error);
      }
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
      try {
        const meta = this.loom.meta(resource);
        const abilities = this.loom.abilitiesFor(resource);
        if (!abilities.canCreate) {
          throw new LoomAuthorizationError(`You are not allowed to create ${meta.singularLabel}`);
        }
        const relationOptions = await this.loom.relationOptionsForForm(meta);
        const record: Record<string, unknown> = {};
        if (prefilledName?.trim()) {
          const titleField =
            meta.recordTitleField && meta.recordTitleField !== 'displayName'
              ? meta.recordTitleField
              : 'name';
          record[titleField] = prefilledName.trim();
        }
        const context = await shellContext(this.loom, {
          currentSlug: resource,
          pageTitle: `Create ${meta.singularLabel}`,
          resource: meta,
          abilities,
          record,
          mode: 'create',
          readonly: false,
          embed: embed === '1',
          relationOptions,
          relationFieldContexts: this.loom.relationFieldContexts(meta),
          flash: flashFromQuery(success, error),
          hasMediaFields: resourceHasMediaFields(meta),
          mediaUploadUrl: `${this.loom.basePath}/${resource}/media/upload`,
        });
        return this.views.render('form', context, embed === '1' ? { layout: 'bare' } : undefined);
      } catch (error) {
        throw mapAuthError(error);
      }
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
          Math.min(250, Math.max(1, Number(limit) || 15)),
        );
        return JSON.stringify({
          results: results.map((item) => ({
            id: item.value,
            label: item.label,
            group: item.group,
            ability: item.ability,
          })),
        });
      } catch (error) {
        throw mapAuthError(error, HttpStatus.BAD_REQUEST);
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
        throw mapAuthError(error, HttpStatus.BAD_REQUEST);
      }
    }

    @Get(':resource/export')
    async exportResource(
      @Param('resource') resource: string,
      @Query('page') page = '1',
      @Query('perPage') perPage = '15',
      @Query('search') search?: string,
      @Query('sort') sort?: string,
      @Query('direction') direction?: SortDirection,
      @Query('trashed') trashed?: string,
      @Query('format') format?: string,
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        send?: (body?: unknown) => unknown;
      } = {},
    ): Promise<void> {
      try {
        const query = normalizeListQuery({ page, perPage, search, sort, direction, trashed });
        const exported = await this.loom.exportRecords(
          resource,
          query,
          this.loom.parseExportFormat(format),
        );
        res.setHeader?.('Content-Type', exported.contentType);
        res.setHeader?.(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.header?.('Content-Type', exported.contentType);
        res.header?.(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.send?.(exported.body);
      } catch (error) {
        throw mapAuthError(error);
      }
    }

    @Post(':resource/bulk')
    @Redirect()
    async bulkAction(
      @Param('resource') resource: string,
      @Body() body: { action?: string; ids?: string | string[] },
    ): Promise<{ url: string; statusCode: number }> {
      try {
        const action = body.action ?? 'delete';
        const rawIds = body.ids;
        const ids = Array.isArray(rawIds)
          ? rawIds
          : typeof rawIds === 'string'
            ? rawIds.split(',').map((part) => part.trim()).filter(Boolean)
            : [];
        if (action === 'delete') {
          const result = await this.loom.bulkDelete(resource, ids);
          return {
            url: `${this.loom.basePath}/${resource}?success=bulk-deleted&count=${result.deleted}`,
            statusCode: 302,
          };
        }
        throw new HttpException(`Unknown bulk action "${action}"`, HttpStatus.BAD_REQUEST);
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Bulk action failed',
        );
        return {
          url: `${this.loom.basePath}/${resource}?error=${message}`,
          statusCode: 302,
        };
      }
    }

    @Post(':resource/media/upload')
    @Header('Content-Type', 'application/json; charset=utf-8')
    async uploadMedia(
      @Param('resource') resource: string,
      @Body()
      body: {
        field?: string;
        filename?: string;
        mimeType?: string;
        data?: string;
      },
    ): Promise<string> {
      try {
        const stored = await this.loom.uploadMedia(resource, String(body.field ?? ''), {
          filename: String(body.filename ?? 'upload'),
          mimeType: String(body.mimeType ?? 'application/octet-stream'),
          data: String(body.data ?? ''),
        });
        return JSON.stringify({ ok: true, media: stored });
      } catch (error) {
        throw mapAuthError(error, HttpStatus.BAD_REQUEST);
      }
    }

    @Get('media/*')
    async serveMedia(
      @Param() params: Record<string, string>,
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        send?: (body?: unknown) => unknown;
      },
    ): Promise<void> {
      const root = this.loom.localMediaRoot;
      if (!root) {
        throw new HttpException('Media storage is not configured', HttpStatus.NOT_FOUND);
      }
      const suffix = params['0'] ?? params['*'] ?? '';
      const filePath = join(root, suffix);
      if (!filePath.startsWith(root)) {
        throw new HttpException('Invalid media path', HttpStatus.BAD_REQUEST);
      }
      try {
        const body = readFileSync(filePath);
        res.setHeader?.('Cache-Control', 'public, max-age=86400');
        res.header?.('Cache-Control', 'public, max-age=86400');
        res.send?.(body);
      } catch {
        throw new HttpException('Media not found', HttpStatus.NOT_FOUND);
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
        throw mapAuthError(error, HttpStatus.NOT_FOUND);
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
      try {
        const meta = this.loom.meta(resource);
        const record = await this.loom.findOne(resource, id);
        const abilities = this.loom.abilitiesFor(resource, record);
        if (!abilities.canEdit) {
          throw new LoomAuthorizationError(`You are not allowed to edit ${meta.singularLabel}`);
        }
        const [relationOptions, relationLabels] = await Promise.all([
          this.loom.relationOptionsForForm(meta),
          this.loom.relationLabelsForRecords(meta, [record]),
        ]);
        const context = await shellContext(this.loom, {
          currentSlug: resource,
          pageTitle: `Edit ${meta.singularLabel}`,
          resource: meta,
          abilities,
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
          hasMediaFields: resourceHasMediaFields(meta),
          mediaUploadUrl: `${this.loom.basePath}/${resource}/media/upload`,
        });
        return this.views.render('form', context, embed === '1' ? { layout: 'bare' } : undefined);
      } catch (error) {
        throw mapAuthError(error);
      }
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
      try {
        const meta = this.loom.meta(resource);
        const record = await this.loom.findOne(resource, id);
        const abilities = this.loom.abilitiesFor(resource, record);
        const relationLabels = await this.loom.relationLabelsForRecords(meta, [record]);
        const pageTitle = this.loom.recordTitle(meta, record);
        const context = await shellContext(this.loom, {
          currentSlug: resource,
          pageTitle,
          showEditButton: !embed && abilities.canEdit,
          showBackToList: !embed,
          resource: meta,
          abilities,
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
      } catch (error) {
        throw mapAuthError(error);
      }
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

    @Post(':resource/:id/restore')
    @Redirect()
    async restoreRecord(
      @Param('resource') resource: string,
      @Param('id') id: string,
    ): Promise<{ url: string; statusCode: number }> {
      try {
        await this.loom.restore(resource, id);
        return {
          url: `${this.loom.basePath}/${resource}?trashed=1&success=restored`,
          statusCode: 302,
        };
      } catch (error) {
        const message = encodeURIComponent(
          error instanceof Error ? error.message : 'Restore failed',
        );
        return {
          url: `${this.loom.basePath}/${resource}?trashed=1&error=${message}`,
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

async function shellContext(
  loom: LoomService,
  extra: Record<string, unknown> & {
    currentSlug?: string;
    pageTitle?: string;
    resource?: ResourceMeta;
  },
): Promise<Record<string, unknown>> {
  const pageTitle = (extra.pageTitle as string | undefined) ?? loom.panelTitle;
  const menu = loom.menuContext(extra.currentSlug, pageTitle);
  const rawCompanyId = loom.currentCompanyId;
  const currentCompanyId =
    rawCompanyId != null && String(rawCompanyId) !== ''
      ? String(rawCompanyId)
      : undefined;
  const companies = (await loom.shellCompanies()).map((company) => {
    const id = String(company.id);
    return {
      ...company,
      id,
      current: currentCompanyId != null && id === currentCompanyId,
    };
  });
  const currentCompany = companies.find((c) => c.current) ?? companies.find((c) => c.id === currentCompanyId);
  const requestPath = currentRequestContext()?.path;
  const switchRedirect =
    typeof requestPath === 'string' &&
    requestPath.startsWith(loom.basePath) &&
    !requestPath.includes('/company/switch') &&
    !requestPath.includes('/login')
      ? safeRedirect(requestPath, loom.basePath)
      : loom.basePath;
  const abilities =
    extra.abilities ??
    (extra.currentSlug ? loom.abilitiesFor(extra.currentSlug) : undefined);
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
    allCompaniesSelected: loom.tenancyEnabled && !currentCompanyId,
    tenancyEnabled: loom.tenancyEnabled,
    canViewAllCompanies: loom.canViewAllCompanies,
    switchCompanyPath: `${loom.basePath}/company/switch`,
    switchRedirect,
    user: loom.user,
    userInitial: loom.userInitial(),
    authEnabled: loom.authEnabled,
    logoutPath: `${loom.basePath}/logout`,
    csrfToken: currentCsrfToken(),
    abilities,
    t: loom.t.bind(loom),
    locale: loom.locale,
    ...menu,
    ...extra,
  };
}

function mapAuthError(error: unknown, fallbackStatus = HttpStatus.FORBIDDEN): HttpException {
  // Let LoomForbiddenExceptionFilter render HTML for admin 403s
  if (error instanceof LoomAuthorizationError) {
    throw error;
  }
  if (error instanceof HttpException) return error;
  return new HttpException(
    error instanceof Error ? error.message : 'Request failed',
    fallbackStatus,
  );
}


function resolveCompanySwitchRedirect(
  explicit: unknown,
  referer: unknown,
  basePath: string,
): string {
  const fromBody = safeRedirect(explicit, '');
  if (fromBody) return fromBody;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      const url = new URL(referer, 'http://localhost');
      const path = `${url.pathname}${url.search}`;
      if (
        path.startsWith(basePath) &&
        !path.includes('/company/switch') &&
        !path.includes('/login')
      ) {
        return path;
      }
    } catch {
      // ignore invalid referer
    }
  }
  return basePath;
}

function safeRedirect(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

function sendRedirect(
  res: {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => unknown;
    redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
    status?: (code: number) => { send?: (body?: unknown) => unknown };
    send?: (body?: unknown) => unknown;
    statusCode?: number;
  },
  url: string,
): void {
  if (typeof res.header === 'function' && typeof res.status === 'function' && !res.setHeader) {
    res.header('Location', url);
    res.status(302).send?.('');
    return;
  }
  if (typeof res.redirect === 'function') {
    try {
      (res.redirect as (status: number, url: string) => unknown)(302, url);
      return;
    } catch {
      // continue
    }
    try {
      (res.redirect as (url: string, status?: number) => unknown)(url, 302);
      return;
    } catch {
      // continue
    }
  }
  if (typeof res.setHeader === 'function') {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.send?.('');
  }
}
