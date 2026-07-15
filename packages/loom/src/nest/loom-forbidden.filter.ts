import {
  Catch,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { LoomAuthorizationError } from '../core/abilities.js';
import { currentRequestContext } from '../core/request-context.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_OPTIONS } from '../core/types.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';

type HttpResponse = {
  status: (code: number) => HttpResponse;
  type?: (type: string) => HttpResponse;
  setHeader?: (name: string, value: string) => void;
  header?: (name: string, value: string) => HttpResponse;
  send: (body: unknown) => unknown;
  json?: (body: unknown) => unknown;
};

type HttpRequest = {
  url?: string;
  originalUrl?: string;
  path?: string;
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

@Catch(LoomAuthorizationError)
export class LoomForbiddenExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly views: LoomViewService,
    private readonly loom: LoomService,
    @Inject(LOOM_OPTIONS) private readonly options: LoomModuleOptions,
  ) {}

  async catch(exception: LoomAuthorizationError, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const res = http.getResponse<HttpResponse>();
    const req = http.getRequest<HttpRequest>();
    const path = String(req.originalUrl ?? req.url ?? req.path ?? '');
    const ctx = currentRequestContext();
    this.options.observability?.onError?.({
      error: exception,
      requestId: ctx?.requestId,
      userId: ctx?.userId,
      path,
      resource: ctx?.resource,
      ability: ctx?.ability,
    });

    const accept = String(req.headers?.accept ?? '');
    const wantsJson =
      path.includes('/api/loom') ||
      path.includes(`/${this.loom.apiPrefix}`) ||
      accept.includes('application/json');

    if (ctx?.requestId) {
      res.setHeader?.('X-Request-Id', ctx.requestId);
      res.header?.('X-Request-Id', ctx.requestId);
    }

    if (wantsJson) {
      const body = {
        statusCode: exception.statusCode,
        error: 'Forbidden',
        message: exception.message,
      };
      res.status(exception.statusCode);
      if (typeof res.json === 'function') {
        res.json(body);
        return;
      }
      res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
      res.header?.('Content-Type', 'application/json; charset=utf-8');
      res.send(JSON.stringify(body));
      return;
    }

    const embed =
      String(req.query?.embed ?? '') === '1' || path.includes('embed=1');
    const slug = extractResourceSlug(path, this.loom.basePath);
    let resource;
    try {
      resource = slug ? this.loom.meta(slug) : undefined;
    } catch {
      resource = undefined;
    }

    const html = this.views.render(
      'access-denied',
      {
        title: 'Access denied',
        pageTitle: 'Access denied',
        panelTitle: this.loom.panelTitle,
        basePath: this.loom.basePath,
        branding: this.loom.branding,
        navGroups: this.loom.navigationGroups(),
        companies: await this.loom.shellCompanies(),
        currentCompanyId: this.loom.currentCompanyId,
        tenancyEnabled: this.loom.tenancyEnabled,
        canViewAllCompanies: this.loom.canViewAllCompanies,
        switchCompanyPath: `${this.loom.basePath}/company/switch`,
        user: this.loom.user,
        userInitial: this.loom.userInitial(),
        authEnabled: this.loom.authEnabled,
        logoutPath: this.loom.logoutPath,
        accountPath: this.loom.accountPath,
        changePasswordPath: this.loom.changePasswordPath,
        apiDocsPath: this.loom.apiDocsPath,
        message: exception.message,
        resource,
        embed,
        ...this.loom.menuContext(slug, 'Access denied'),
      },
      embed ? { layout: 'bare' } : undefined,
    );

    res.status(exception.statusCode);
    if (typeof res.type === 'function') {
      res.type('html').send(html);
      return;
    }
    res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
    res.header?.('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

function extractResourceSlug(path: string, basePath: string): string | undefined {
  const base = basePath.replace(/\/$/, '') || '/admin';
  const pathname = path.split('?')[0] ?? path;
  if (!pathname.startsWith(base)) return undefined;
  const rest = pathname.slice(base.length).replace(/^\//, '');
  const segment = rest.split('/')[0];
  if (!segment || segment === 'login' || segment === 'logout' || segment === 'assets') {
    return undefined;
  }
  return segment;
}
