import {
  Controller,
  Get,
  Header,
  Req,
  Res,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LoomAuthService,
  LoomService,
  buildBrandingCss,
  loomAdminCssPath,
  loomAlpineJsPath,
  loomUiJsPath,
  setResponseCookies,
} from '@nodeweaver/loom';
import {
  appBaseFromEnv,
  joinAppPath,
  nestControllerPath,
} from '../app-path';
import { SiteViewService } from './site-view.service';

function siteCssPath(): string {
  const candidates = [
    join(process.cwd(), 'views', 'assets', 'site.css'),
    join(process.cwd(), 'apps/api/views', 'assets', 'site.css'),
    join(__dirname, '..', '..', 'views', 'assets', 'site.css'),
    join(__dirname, '..', 'views', 'assets', 'site.css'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(`site.css not found (looked in: ${candidates.join(', ')})`);
}

type SiteReq = {
  url?: string;
  originalUrl?: string;
  method?: string;
  headers?: Record<string, unknown>;
  cookies?: Record<string, string>;
  loomUser?: { id: string; name?: string; email?: string } | null;
};

type SiteRes = {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  appendHeader?: (name: string, value: string) => void;
  header?: (name: string, value: string) => unknown;
  type?: (contentType: string) => SiteRes;
  redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
  status?: (code: number) => { send?: (body?: unknown) => unknown; type?: (t: string) => unknown };
  send?: (body?: unknown) => unknown;
};

/**
 * App-owned public/product UI. Auth HTML lives on Loom at `{APP_BASE_PATH}/login`;
 * this module serves marketing + signed-in app shell pages under the same prefix.
 */
@Controller(nestControllerPath(appBaseFromEnv() || '/'))
export class SiteController {
  constructor(
    private readonly views: SiteViewService,
    private readonly auth: LoomAuthService,
    private readonly loom: LoomService,
  ) {}

  @Get('assets/admin.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  adminCss(): string {
    return readFileSync(loomAdminCssPath(), 'utf8');
  }

  @Get('assets/branding.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  brandingCss(): string {
    return buildBrandingCss(this.loom.branding);
  }

  @Get('assets/alpine.min.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  alpineJs(): string {
    return readFileSync(loomAlpineJsPath(), 'utf8');
  }

  @Get('assets/loom-ui.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  loomUi(): string {
    return readFileSync(loomUiJsPath(), 'utf8');
  }

  @Get('assets/site.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  siteCss(): string {
    return readFileSync(siteCssPath(), 'utf8');
  }

  @Get()
  async home(@Req() req: SiteReq, @Res() res: SiteRes): Promise<void> {
    const user = this.auth.enabled
      ? await this.auth.resolveUserFromRequest(req)
      : null;
    req.loomUser = user;
    this.sendHtml(
      res,
      this.views.render('home', 'public', this.pageContext(req, res, user)),
    );
  }

  @Get('app')
  async dashboard(@Req() req: SiteReq, @Res() res: SiteRes): Promise<void> {
    if (this.auth.enabled) {
      const user = await this.auth.resolveUserFromRequest(req);
      if (!user) {
        const fallback = joinAppPath(this.loom.appBasePath, 'app');
        const path = (req.originalUrl ?? req.url ?? fallback).split('?')[0] || fallback;
        redirect(res, `${this.auth.loginPath}?redirect=${encodeURIComponent(path)}`);
        return;
      }
      req.loomUser = user;
      this.sendHtml(
        res,
        this.views.render('dashboard', 'app-shell', {
          ...this.pageContext(req, res, user),
          pageTitle: 'Portal',
        }),
      );
      return;
    }

    this.sendHtml(
      res,
      this.views.render('dashboard', 'app-shell', {
        ...this.pageContext(req, res, null),
        pageTitle: 'Portal',
      }),
    );
  }

  private pageContext(
    req: SiteReq,
    res: SiteRes,
    user?: { id: string; name?: string; email?: string } | null,
  ): Record<string, unknown> {
    const csrf = this.auth.ensureCsrf(req, true);
    if (csrf.setCookie) {
      setResponseCookies(res, [csrf.setCookie]);
    }
    return {
      brandName: this.loom.branding.brandName,
      branding: this.loom.branding,
      csrfToken: csrf.token,
      user: user ?? null,
      homePath: this.loom.homePath,
      appPath: joinAppPath(this.loom.appBasePath, 'app'),
      assetsPath: joinAppPath(this.loom.appBasePath, 'assets'),
      adminPath: this.loom.basePath,
      loginPath: this.auth.loginPath,
      logoutPath: this.auth.logoutPath,
      accountPath: this.auth.accountPath,
      changePasswordPath: this.auth.changePasswordPath,
      authEnabled: this.auth.enabled,
    };
  }

  private sendHtml(res: SiteRes, html: string): void {
    if (typeof res.type === 'function') {
      res.type('text/html; charset=utf-8');
    } else {
      res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
      res.header?.('Content-Type', 'text/html; charset=utf-8');
    }
    res.send?.(html);
  }
}

function redirect(res: SiteRes, url: string): void {
  if (typeof res.redirect === 'function') {
    try {
      (res.redirect as (status: number, url: string) => unknown)(302, url);
      return;
    } catch {
      /* continue */
    }
    try {
      (res.redirect as (url: string, status?: number) => unknown)(url, 302);
      return;
    } catch {
      /* continue */
    }
  }
  if (typeof res.setHeader === 'function') {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.send?.('');
  }
}
