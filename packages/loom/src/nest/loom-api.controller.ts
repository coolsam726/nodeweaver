import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
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
import type { SortDirection } from '../core/types.js';
import { LoomPublic } from './loom-auth.decorators.js';
import { LoomAuthContextInterceptor } from './loom-auth-context.interceptor.js';
import { setResponseCookies } from './loom-auth.interceptor.js';
import { LoomAuthService } from './loom-auth.service.js';
import { LoomService } from './loom.service.js';
import { clientIpFromRequest } from './request-ip.js';
import { currentLoomUser } from '../core/auth.js';

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
