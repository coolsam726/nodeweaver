import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LoomAuthOptions } from './auth.js';

export const DEFAULT_CSRF_COOKIE = 'loom_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_FIELD = '_csrf';

export class LoomCsrfError extends Error {
  readonly statusCode = 403;

  constructor(message = 'Invalid CSRF token') {
    super(message);
    this.name = 'LoomCsrfError';
  }
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function csrfCookieName(options: LoomAuthOptions): string {
  if (options.csrf && typeof options.csrf === 'object' && options.csrf.cookieName) {
    return options.csrf.cookieName;
  }
  return DEFAULT_CSRF_COOKIE;
}

export function isCsrfEnabled(options: LoomAuthOptions | undefined): boolean {
  if (!options?.secret) return false;
  return options.csrf !== false;
}

export function buildCsrfCookie(
  options: LoomAuthOptions,
  token: string | null,
): string {
  const name = csrfCookieName(options);
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const path = options.cookiePath ?? '/';
  const parts = [
    `${name}=${token ? encodeURIComponent(token) : ''}`,
    `Path=${path}`,
    'SameSite=Lax',
    `Max-Age=${token ? Math.floor(maxAgeMs / 1000) : 0}`,
  ];
  // Readable by JS so fetch can send X-CSRF-Token (double-submit).
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function readCsrfFromRequest(req: {
  headers?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | undefined {
  const header =
    req.headers?.[CSRF_HEADER] ??
    req.headers?.['X-CSRF-Token'] ??
    req.headers?.['x-csrf-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && typeof header[0] === 'string') {
    return header[0].trim();
  }
  const bodyToken = req.body?.[CSRF_FIELD];
  if (typeof bodyToken === 'string' && bodyToken.trim()) return bodyToken.trim();
  return undefined;
}

/** Optional signed binding of CSRF token to session secret (defense in depth). */
export function signCsrfToken(token: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(token).digest('base64url');
  return `${token}.${sig}`;
}

export function parseSignedCsrfToken(
  value: string | undefined,
  secret: string,
): string | null {
  if (!value) return null;
  const [token, sig] = value.split('.');
  if (!token || !sig) return null;
  const expected = createHmac('sha256', secret).update(token).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}
