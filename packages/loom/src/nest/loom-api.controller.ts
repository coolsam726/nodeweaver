import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { LoomAuthorizationError } from '../core/abilities.js';
import { LoginRateLimitError } from '../core/login-rate-limit.js';
import { LoomCsrfError } from '../core/csrf.js';
import { normalizeListQuery } from '../core/list-query.js';
import { buildLoomOpenApiSpec } from '../core/openapi.js';
import { buildLoomOpenApiDocsHtml } from '../core/openapi-docs.js';
import type { SortDirection } from '../core/types.js';
import { LoomPublic } from './loom-auth.decorators.js';
import { LoomAuthContextInterceptor } from './loom-auth-context.interceptor.js';
import { setResponseCookies } from './loom-auth.interceptor.js';
import { LoomAuthService } from './loom-auth.service.js';
import { LoomService } from './loom.service.js';
import {
  loomRedocStandalonePath,
  loomSwaggerUiBundlePath,
  loomSwaggerUiCssPath,
} from './paths.js';
import { clientIpFromRequest } from './request-ip.js';
import { currentLoomUser } from '../core/auth.js';
import { DEFAULT_CSRF_COOKIE, csrfCookieName } from '../core/csrf.js';
import { readFileSync } from 'node:fs';

export function createLoomApiController(
  prefix = 'api/loom',
): new (...args: never[]) => object {
  const route = prefix.replace(/^\//, '').replace(/\/$/, '') || 'api/loom';

  @Controller(route)
  @UseInterceptors(LoomAuthContextInterceptor)
  class LoomApiController {
    constructor(
      private readonly loom: LoomService,
      private readonly auth: LoomAuthService,
    ) {}

    @Get('me')
    me() {
      const user = this.loom.authUserPublic();
      if (this.auth.enabled && !user) {
        throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
      }
      return {
        user,
        authEnabled: this.loom.authEnabled,
        resources: this.loom.accessibleResources().map((meta) => ({
          slug: meta.slug,
          label: meta.label,
          singularLabel: meta.singularLabel,
          abilities: this.loom.abilitiesFor(meta.slug),
        })),
      };
    }


    @Get('companies')
    async companies() {
      const user = currentLoomUser();
      if (this.auth.enabled && !user) {
        throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
      }
      return {
        items: await this.auth.listSwitchableCompanies(user),
        currentCompanyId: user?.companyId ?? null,
        tenancyEnabled: this.auth.tenancyActive,
        canViewAllCompanies: Boolean(user && this.loom.canViewAllCompanies),
      };
    }

    @Post('company/switch')
    async switchCompany(
      @Body() body: { companyId?: string | null },
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        status?: (code: number) => { send?: (body?: unknown) => unknown; json?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        json?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      const user = currentLoomUser();
      if (!user || !this.auth.tenancyActive) {
        throw new HttpException('Company tenancy is not enabled', HttpStatus.BAD_REQUEST);
      }
      try {
        const result = await this.auth.switchCompany(
          user,
          body.companyId === undefined || body.companyId === null
            ? ''
            : String(body.companyId),
        );
        setResponseCookies(res, result.cookies);
        sendJson(res, 200, {
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            companyId: result.user.companyId ?? null,
          },
        });
      } catch (error) {
        if (error instanceof LoomAuthorizationError) {
          sendJson(res, 403, { message: error.message });
          return;
        }
        throw error;
      }
    }

    @Get('resources')
    resources() {
      return {
        items: this.loom.accessibleResources().map((meta) => ({
          slug: meta.slug,
          label: meta.label,
          singularLabel: meta.singularLabel,
          navigationGroup: meta.navigationGroup,
          icon: meta.icon,
          abilities: this.loom.abilitiesFor(meta.slug),
        })),
      };
    }

    @LoomPublic()
    @Get('openapi.json')
    openApiDocument() {
      if (!this.loom.openapiEnabled) {
        throw new HttpException('OpenAPI is not enabled', HttpStatus.NOT_FOUND);
      }
      return buildLoomOpenApiSpec({
        title: this.loom.panelTitle,
        apiPrefix: this.loom.apiPrefix,
        version: this.loom.apiVersion,
        resources: this.loom.documentedResources(),
      });
    }

    @LoomPublic()
    @Get('docs')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    openApiDocs(): string {
      if (!this.loom.openapiDocsEnabled) {
        throw new HttpException('OpenAPI docs are not enabled', HttpStatus.NOT_FOUND);
      }
      const prefix = `/${this.loom.apiPrefix.replace(/^\//, '')}`;
      const auth = this.auth.authOptions;
      // Single-UI mode `redoc` still uses /docs as the entry URL.
      if (!this.loom.openapiSwaggerEnabled) {
        return buildLoomOpenApiDocsHtml({
          title: this.loom.panelTitle,
          specUrl: `${prefix}/openapi.json`,
          docsBasePath: `${prefix}/redoc`,
          ui: 'redoc',
        });
      }
      return buildLoomOpenApiDocsHtml({
        title: this.loom.panelTitle,
        specUrl: `${prefix}/openapi.json`,
        docsBasePath: `${prefix}/docs`,
        ui: 'swagger',
        csrfCookieName: auth ? csrfCookieName(auth) : DEFAULT_CSRF_COOKIE,
      });
    }

    @LoomPublic()
    @Get('docs/swagger-ui.css')
    @Header('Content-Type', 'text/css; charset=utf-8')
    @Header('Cache-Control', 'public, max-age=86400')
    openApiDocsCss(): string {
      if (!this.loom.openapiSwaggerEnabled) {
        throw new HttpException('OpenAPI docs are not enabled', HttpStatus.NOT_FOUND);
      }
      return readFileSync(loomSwaggerUiCssPath(), 'utf8');
    }

    @LoomPublic()
    @Get('docs/swagger-ui-bundle.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'public, max-age=86400')
    openApiDocsJs(): string {
      if (!this.loom.openapiSwaggerEnabled) {
        throw new HttpException('OpenAPI docs are not enabled', HttpStatus.NOT_FOUND);
      }
      return readFileSync(loomSwaggerUiBundlePath(), 'utf8');
    }

    @LoomPublic()
    @Get('redoc')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-cache')
    openApiRedoc(): string {
      if (!this.loom.openapiRedocEnabled) {
        throw new HttpException('OpenAPI Redoc is not enabled', HttpStatus.NOT_FOUND);
      }
      const prefix = `/${this.loom.apiPrefix.replace(/^\//, '')}`;
      return buildLoomOpenApiDocsHtml({
        title: this.loom.panelTitle,
        specUrl: `${prefix}/openapi.json`,
        docsBasePath: `${prefix}/redoc`,
        ui: 'redoc',
      });
    }

    @LoomPublic()
    @Get('redoc/redoc.standalone.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'public, max-age=86400')
    openApiRedocJs(): string {
      if (!this.loom.openapiRedocEnabled) {
        throw new HttpException('OpenAPI Redoc is not enabled', HttpStatus.NOT_FOUND);
      }
      return readFileSync(loomRedocStandalonePath(), 'utf8');
    }

    @LoomPublic()
    @Post('login')
    async login(
      @Req() req: { ip?: string; headers?: Record<string, unknown>; socket?: { remoteAddress?: string } },
      @Body() body: { email?: string; password?: string },
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        status?: (code: number) => { send?: (body?: unknown) => unknown; json?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        json?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      try {
        const result = await this.auth.authenticate(
          String(body.email ?? ''),
          String(body.password ?? ''),
          { ip: clientIpFromRequest(req) },
        );
        if (!result) {
          sendJson(res, 401, { message: 'Invalid email or password' });
          return;
        }
        setResponseCookies(res, result.cookies);
        sendJson(res, 200, {
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            companyId: result.user.companyId,
          },
        });
      } catch (error) {
        if (error instanceof LoginRateLimitError) {
          sendJson(res, 429, {
            message: error.message,
            retryAfterSec: error.retryAfterSec,
          });
          return;
        }
        if (error instanceof LoomCsrfError) {
          sendJson(res, 403, { message: error.message });
          return;
        }
        throw error;
      }
    }

    @LoomPublic()
    @Post('forgot-password')
    async forgotPassword(
      @Req() req: {
        ip?: string;
        headers?: Record<string, unknown>;
        socket?: { remoteAddress?: string };
        protocol?: string;
      },
      @Body() body: { email?: string },
    ) {
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
        const adminBase = this.loom.basePath;
        const resetBaseUrl = host ? `${proto}://${host}${adminBase}` : adminBase;
        return await this.auth.requestPasswordReset(String(body.email ?? ''), {
          ip: clientIpFromRequest(req),
          resetBaseUrl,
        });
      } catch (error) {
        if (error instanceof LoginRateLimitError) {
          throw new HttpException(
            { message: error.message, retryAfterSec: error.retryAfterSec },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (error instanceof LoomCsrfError) {
          throw new ForbiddenException(error.message);
        }
        throw error;
      }
    }

    @LoomPublic()
    @Post('reset-password')
    async resetPassword(
      @Body() body: { token?: string; password?: string },
    ) {
      if (!this.auth.enabled || !this.auth.passwordResetEnabled) {
        throw new HttpException('Password reset is not available', HttpStatus.NOT_FOUND);
      }
      const result = await this.auth.resetPasswordWithToken(
        String(body.token ?? ''),
        String(body.password ?? ''),
      );
      if (!result.ok) {
        throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
      }
      return { ok: true, message: 'Password updated' };
    }

    @LoomPublic()
    @Post('logout')
    async logout(
      @Res() res: {
        setHeader?: (name: string, value: string) => void;
        appendHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        status?: (code: number) => { send?: (body?: unknown) => unknown; json?: (body?: unknown) => unknown };
        send?: (body?: unknown) => unknown;
        json?: (body?: unknown) => unknown;
        statusCode?: number;
      },
    ): Promise<void> {
      const user = currentLoomUser();
      if (user) {
        await this.auth.bumpSessionVersion(user.id);
      }
      setResponseCookies(res, this.auth.clearSessionCookies());
      sendJson(res, 200, { ok: true });
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
      @Res() res?: {
        setHeader?: (name: string, value: string) => void;
        header?: (name: string, value: string) => unknown;
        send?: (body?: unknown) => unknown;
      },
    ) {
      try {
        const query = normalizeListQuery({ page, perPage, search, sort, direction, trashed });
        const exportFormat = this.loom.parseExportFormat(format);
        const exported = await this.loom.exportRecords(resource, query, exportFormat);
        if (res) {
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
          return;
        }
        return exported;
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Post(':resource/bulk')
    async bulkAction(
      @Param('resource') resource: string,
      @Body() body: { action?: string; ids?: string[] },
    ) {
      try {
        const action = body.action ?? 'delete';
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (action === 'delete') {
          return await this.loom.bulkDelete(resource, ids);
        }
        return await this.loom.runBulkAction(resource, action, ids);
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Post(':resource/media/upload')
    async uploadMedia(
      @Param('resource') resource: string,
      @Body()
      body: {
        field?: string;
        filename?: string;
        mimeType?: string;
        data?: string;
      },
    ) {
      try {
        const stored = await this.loom.uploadMedia(resource, String(body.field ?? ''), {
          filename: String(body.filename ?? 'upload'),
          mimeType: String(body.mimeType ?? 'application/octet-stream'),
          data: String(body.data ?? ''),
        });
        return { ok: true, media: stored };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Get(':resource')
    async list(
      @Param('resource') resource: string,
      @Query('page') page = '1',
      @Query('perPage') perPage = '15',
      @Query('search') search?: string,
      @Query('sort') sort?: string,
      @Query('direction') direction?: SortDirection,
      @Query('trashed') trashed?: string,
    ) {
      try {
        const query = normalizeListQuery({ page, perPage, search, sort, direction, trashed });
        const result = await this.loom.list(resource, query);
        const meta = this.loom.meta(resource);
        return {
          ...result,
          items: result.items.map((item) => this.loom.sanitizeRecord(meta, item)),
          abilities: this.loom.abilitiesFor(resource),
        };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Get(':resource/:id')
    async show(@Param('resource') resource: string, @Param('id') id: string) {
      try {
        const meta = this.loom.meta(resource);
        const record = await this.loom.findOne(resource, id);
        return {
          data: this.loom.sanitizeRecord(meta, record),
          abilities: this.loom.abilitiesFor(resource, record),
        };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Post(':resource')
    async create(
      @Param('resource') resource: string,
      @Body() body: Record<string, unknown>,
    ) {
      try {
        const meta = this.loom.meta(resource);
        const created = await this.loom.createRecord(resource, body);
        return {
          data: this.loom.sanitizeRecord(meta, created),
          abilities: this.loom.abilitiesFor(resource, created),
        };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Put(':resource/:id')
    @Patch(':resource/:id')
    async update(
      @Param('resource') resource: string,
      @Param('id') id: string,
      @Body() body: Record<string, unknown>,
    ) {
      try {
        const meta = this.loom.meta(resource);
        const updated = await this.loom.update(resource, id, body);
        return {
          data: this.loom.sanitizeRecord(meta, updated),
          abilities: this.loom.abilitiesFor(resource, updated),
        };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Delete(':resource/:id')
    async remove(@Param('resource') resource: string, @Param('id') id: string) {
      try {
        await this.loom.delete(resource, id);
        return { ok: true, id };
      } catch (error) {
        throw mapApiError(error);
      }
    }

    @Post(':resource/:id/restore')
    async restore(@Param('resource') resource: string, @Param('id') id: string) {
      try {
        const meta = this.loom.meta(resource);
        const record = await this.loom.restore(resource, id);
        return {
          data: this.loom.sanitizeRecord(meta, record),
          abilities: this.loom.abilitiesFor(resource, record),
        };
      } catch (error) {
        throw mapApiError(error);
      }
    }
  }

  return LoomApiController;
}

function mapApiError(error: unknown): HttpException {
  if (error instanceof LoomAuthorizationError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof HttpException) return error;
  const message = error instanceof Error ? error.message : 'Request failed';
  if (message === 'Record not found' || message.startsWith('Unknown Loom resource')) {
    return new HttpException(message, HttpStatus.NOT_FOUND);
  }
  return new HttpException(message, HttpStatus.BAD_REQUEST);
}

function sendJson(
  res: {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => unknown;
    status?: (code: number) => { send?: (body?: unknown) => unknown; json?: (body?: unknown) => unknown };
    send?: (body?: unknown) => unknown;
    json?: (body?: unknown) => unknown;
    statusCode?: number;
  },
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  if (typeof res.status === 'function') {
    const reply = res.status(status);
    if (typeof reply.json === 'function') {
      reply.json(body);
      return;
    }
    if (typeof res.header === 'function') {
      res.header('Content-Type', 'application/json; charset=utf-8');
    }
    reply.send?.(payload);
    return;
  }
  if (typeof res.setHeader === 'function') {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send?.(payload);
  }
}
