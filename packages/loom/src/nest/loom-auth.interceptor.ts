import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap } from 'rxjs';
import {
  runWithLoomAuth,
  type LoomAuthUser,
} from '../core/auth.js';
import { LoomCsrfError } from '../core/csrf.js';
import { LoomAuthService } from './loom-auth.service.js';

type HttpRequest = {
  url?: string;
  originalUrl?: string;
  method?: string;
  headers?: Record<string, unknown>;
  cookies?: Record<string, string>;
  body?: Record<string, unknown>;
  loomUser?: LoomAuthUser | null;
};

type HttpResponse = {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  appendHeader?: (name: string, value: string) => void;
  header?: (name: string, value: string) => HttpResponse;
  redirect?: ((status: number, url: string) => unknown) | ((url: string, status?: number) => unknown);
  status?: (code: number) => HttpResponse;
  send?: (body?: unknown) => unknown;
};

@Injectable()
export class LoomAuthInterceptor implements NestInterceptor {
  constructor(private readonly auth: LoomAuthService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.auth.enabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();
    const pathname = requestPath(req);

    return from(this.auth.resolveUserFromRequest(req)).pipe(
      switchMap((user) => {
        req.loomUser = user;

        const method = (req.method ?? 'GET').toUpperCase();
        const safeMethod =
          method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const csrf = this.auth.ensureCsrf(req, safeMethod);
        if (csrf.setCookie) {
          appendResponseCookie(res, csrf.setCookie);
        }

        try {
          this.auth.assertCsrf(req);
        } catch (error) {
          if (error instanceof LoomCsrfError) {
            if (isHtmlMutation(req)) {
              const loginUrl = `${this.auth.loginPath}?error=${encodeURIComponent(error.message)}`;
              redirect(res, loginUrl);
              return of(undefined);
            }
            throw error;
          }
          throw error;
        }

        if (!user && !this.auth.isPublicPath(pathname)) {
          const loginUrl = `${this.auth.loginPath}?redirect=${encodeURIComponent(pathname)}`;
          redirect(res, loginUrl);
          return of(undefined);
        }

        if (
          user &&
          req.method === 'GET' &&
          (pathname.endsWith('/login') || pathname === this.auth.loginPath)
        ) {
          const base = pathname.replace(/\/login$/, '') || '/admin';
          redirect(res, base);
          return of(undefined);
        }

        return new Observable((subscriber) => {
          runWithLoomAuth(
            user,
            () => {
              next.handle().subscribe({
                next: (value) => subscriber.next(value),
                error: (err) => subscriber.error(err),
                complete: () => subscriber.complete(),
              });
            },
            csrf.token,
          );
        });
      }),
    );
  }
}

function isHtmlMutation(req: HttpRequest): boolean {
  const accept = String(req.headers?.accept ?? '');
  return accept.includes('text/html') || !accept.includes('application/json');
}

function requestPath(req: HttpRequest): string {
  const raw = req.originalUrl ?? req.url ?? '';
  return raw.split('?')[0] || '/';
}

function redirect(res: HttpResponse, url: string): void {
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

export function setResponseCookie(
  res: {
    setHeader?: (name: string, value: string) => void;
    appendHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => unknown;
  },
  cookie: string,
): void {
  appendResponseCookie(res, cookie);
}

export function setResponseCookies(
  res: {
    setHeader?: (name: string, value: string) => void;
    appendHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => unknown;
  },
  cookies: string[],
): void {
  for (const cookie of cookies) {
    if (cookie) appendResponseCookie(res, cookie);
  }
}

function appendResponseCookie(
  res: {
    setHeader?: (name: string, value: string) => void;
    appendHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => unknown;
  },
  cookie: string,
): void {
  if (typeof res.appendHeader === 'function') {
    res.appendHeader('Set-Cookie', cookie);
    return;
  }
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (typeof res.header === 'function') {
    res.header('Set-Cookie', cookie);
  }
}
