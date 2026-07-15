import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { flashFromQuery } from '../core/flash.js';
import { LoginRateLimitError } from '../core/login-rate-limit.js';
import { LoomCsrfError } from '../core/csrf.js';
import { currentCsrfToken, currentLoomUser } from '../core/auth.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';
import { LoomAuthService } from './loom-auth.service.js';
import { LoomAuthInterceptor, setResponseCookies } from './loom-auth.interceptor.js';
import { clientIpFromRequest } from './request-ip.js';
import { queryString, safeRedirect, sendRedirect } from './loom-http.js';
import { nestControllerPath, normalizeAppBasePath } from '../core/app-path.js';

/**
 * Site-wide auth UI at `{appBase}/login`, `/logout`, `/forgot-password`, `/reset-password`
 * (outside the admin `basePath`).
 */
export function createLoomAuthController(
  appBasePath = '',
): new (...args: never[]) => object {
  const route = nestControllerPath(normalizeAppBasePath(appBasePath) || '/');

  @Controller(route)
  @UseInterceptors(LoomAuthInterceptor)
  class LoomAuthController {
    constructor(
      private readonly loom: LoomService,
      private readonly views: LoomViewService,
      private readonly auth: LoomAuthService,
    ) {}

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
        this.authPageContext({
          pageTitle: 'Sign in',
          redirect: redirectTo || this.loom.basePath,
          flash: flashFromQuery(success, error),
          passwordResetEnabled: this.auth.passwordResetEnabled,
        }),
        { layout: 'bare' },
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
          sendRedirect(
            res,
            `${this.auth.loginPath}?error=${message}&redirect=${encodeURIComponent(redirectTo)}`,
          );
          return;
        }
        setResponseCookies(res, result.cookies);
        sendRedirect(res, redirectTo);
      } catch (error) {
        if (error instanceof LoginRateLimitError || error instanceof LoomCsrfError) {
          const message = encodeURIComponent(error.message);
          sendRedirect(
            res,
            `${this.auth.loginPath}?error=${message}&redirect=${encodeURIComponent(redirectTo)}`,
          );
          return;
        }
        throw error;
      }
    }

    @Get('logout')
    async logoutGet(
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
      await this.performLogout(res);
    }

    /**
     * Must be a separate handler from GET — Nest `@Get`/`@Post` on the same
     * method overwrite each other (only the last HTTP method is registered).
     */
    @Post('logout')
    async logoutPost(
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
      await this.performLogout(res);
    }

    @Get('account')
    @Header('Content-Type', 'text/html; charset=utf-8')
    accountForm(
      @Query('error') error?: string,
      @Query('success') success?: string,
    ): string {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      const user = currentLoomUser();
      if (!user) {
        throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
      }
      return this.views.render(
        'account',
        this.authPageContext({
          pageTitle: 'Edit profile',
          user,
          flash: flashFromQuery(success, error),
          accountPath: this.auth.accountPath,
          changePasswordPath: this.auth.changePasswordPath,
        }),
        { layout: 'bare' },
      );
    }

    @Post('account')
    async accountUpdate(
      @Body() body: { name?: string; email?: string },
      @Res() res: Parameters<typeof sendRedirect>[0],
    ): Promise<void> {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      const user = currentLoomUser();
      if (!user) {
        sendRedirect(res, this.auth.loginPath);
        return;
      }
      const result = await this.auth.updateProfile(user.id, {
        name: body.name,
        email: body.email,
      });
      if (!result.ok) {
        sendRedirect(
          res,
          `${this.auth.accountPath}?error=${encodeURIComponent(result.message)}`,
        );
        return;
      }
      sendRedirect(
        res,
        `${this.auth.accountPath}?success=${encodeURIComponent('Profile updated')}`,
      );
    }

    @Get('account/password')
    @Header('Content-Type', 'text/html; charset=utf-8')
    changePasswordForm(
      @Query('error') error?: string,
      @Query('success') success?: string,
    ): string {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      const user = currentLoomUser();
      if (!user) {
        throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
      }
      return this.views.render(
        'change-password',
        this.authPageContext({
          pageTitle: 'Change password',
          user,
          flash: flashFromQuery(success, error),
          accountPath: this.auth.accountPath,
          changePasswordPath: this.auth.changePasswordPath,
        }),
        { layout: 'bare' },
      );
    }

    @Post('account/password')
    async changePassword(
      @Body() body: { currentPassword?: string; password?: string; passwordConfirm?: string },
      @Res() res: Parameters<typeof sendRedirect>[0],
    ): Promise<void> {
      if (!this.auth.enabled) {
        throw new HttpException('Authentication is not configured', HttpStatus.NOT_FOUND);
      }
      const user = currentLoomUser();
      if (!user) {
        sendRedirect(res, this.auth.loginPath);
        return;
      }
      const password = String(body.password ?? '');
      const confirm = String(body.passwordConfirm ?? '');
      if (password !== confirm) {
        sendRedirect(
          res,
          `${this.auth.changePasswordPath}?error=${encodeURIComponent('Passwords do not match')}`,
        );
        return;
      }
      const result = await this.auth.changePassword(
        user.id,
        String(body.currentPassword ?? ''),
        password,
      );
      if (!result.ok) {
        sendRedirect(
          res,
          `${this.auth.changePasswordPath}?error=${encodeURIComponent(result.message)}`,
        );
        return;
      }
      // Session version bumped — force re-login
      setResponseCookies(res, this.auth.clearSessionCookies());
      sendRedirect(
        res,
        `${this.auth.loginPath}?success=${encodeURIComponent('Password updated. Sign in again.')}`,
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
        this.authPageContext({
          pageTitle: 'Forgot password',
          flash: flashFromQuery(success, error),
        }),
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
        const resetBaseUrl = host ? `${proto}://${host}` : '';
        const result = await this.auth.requestPasswordReset(String(body.email ?? ''), {
          ip: clientIpFromRequest(req),
          resetBaseUrl,
        });
        sendRedirect(
          res,
          `${this.auth.forgotPasswordPath}?success=${encodeURIComponent(result.message)}`,
        );
      } catch (error) {
        if (error instanceof LoginRateLimitError || error instanceof LoomCsrfError) {
          sendRedirect(
            res,
            `${this.auth.forgotPasswordPath}?error=${encodeURIComponent(error.message)}`,
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
        this.authPageContext({
          pageTitle: 'Reset password',
          token: raw,
          tokenValid: valid,
          flash: flashFromQuery(undefined, error),
        }),
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
          `${this.auth.resetPasswordPath}?token=${encodeURIComponent(token)}&error=${encodeURIComponent('Passwords do not match')}`,
        );
        return;
      }
      const result = await this.auth.resetPasswordWithToken(token, password);
      if (!result.ok) {
        sendRedirect(
          res,
          `${this.auth.resetPasswordPath}?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.message)}`,
        );
        return;
      }
      sendRedirect(
        res,
        `${this.auth.loginPath}?success=${encodeURIComponent('Password updated. Sign in with your new password.')}`,
      );
    }

    private async performLogout(
      res: {
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

    private authPageContext(extra: Record<string, unknown>): Record<string, unknown> {
      return {
        panelTitle: this.loom.panelTitle,
        basePath: this.loom.basePath,
        branding: this.loom.branding,
        csrfToken: currentCsrfToken(),
        loginPath: this.auth.loginPath,
        logoutPath: this.auth.logoutPath,
        accountPath: this.auth.accountPath,
        changePasswordPath: this.auth.changePasswordPath,
        forgotPasswordPath: this.auth.forgotPasswordPath,
        resetPasswordPath: this.auth.resetPasswordPath,
        ...extra,
      };
    }
  }

  return LoomAuthController;
}

/** Preserve bookmarks to legacy `{basePath}/login` etc. */
export function createLoomAuthLegacyRedirectController(
  basePath: string,
): new (...args: never[]) => object {
  const route = basePath.replace(/^\//, '') || 'admin';

  @Controller(route)
  class LoomAuthLegacyRedirectController {
    constructor(private readonly auth: LoomAuthService) {}

    @Get('login')
    login(@Query() query: Record<string, unknown>, @Res() res: Parameters<typeof sendRedirect>[0]): void {
      sendRedirect(res, `${this.auth.loginPath}${queryString(query)}`);
    }

    @Get('logout')
    logoutGet(@Res() res: Parameters<typeof sendRedirect>[0]): void {
      sendRedirect(res, this.auth.logoutPath);
    }

    @Post('logout')
    logoutPost(@Res() res: Parameters<typeof sendRedirect>[0]): void {
      sendRedirect(res, this.auth.logoutPath);
    }

    @Get('forgot-password')
    forgot(@Query() query: Record<string, unknown>, @Res() res: Parameters<typeof sendRedirect>[0]): void {
      sendRedirect(res, `${this.auth.forgotPasswordPath}${queryString(query)}`);
    }

    @Get('reset-password')
    reset(@Query() query: Record<string, unknown>, @Res() res: Parameters<typeof sendRedirect>[0]): void {
      sendRedirect(res, `${this.auth.resetPasswordPath}${queryString(query)}`);
    }
  }

  return LoomAuthLegacyRedirectController;
}
