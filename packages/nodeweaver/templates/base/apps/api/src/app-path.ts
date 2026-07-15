/**
 * Runtime helpers for APP_BASE_PATH (mount prefix, e.g. /my-app).
 * Keep in sync with Loom's normalizeAppBasePath / joinAppPath semantics.
 */

export function normalizeAppBasePath(value?: string | null): string {
  if (value == null) return '';
  let raw = String(value).trim();
  if (!raw || raw === '/') return '';
  if (!raw.startsWith('/')) raw = `/${raw}`;
  return raw.replace(/\/+$/, '').replace(/\/{2,}/g, '/');
}

export function joinAppPath(appBasePath: string, ...segments: string[]): string {
  const base = normalizeAppBasePath(appBasePath);
  const parts = segments
    .flatMap((s) => String(s).replace(/^\/+|\/+$/g, '').split('/'))
    .filter(Boolean);
  if (parts.length === 0) return base || '/';
  const suffix = parts.join('/');
  return base ? `${base}/${suffix}` : `/${suffix}`;
}

/** Nest @Controller() path (no leading slash). */
export function nestControllerPath(absoluteOrRelative: string): string {
  const normalized = absoluteOrRelative.replace(/\/+$/, '') || '/';
  if (normalized === '/') return '';
  return normalized.replace(/^\//, '');
}

export function appBaseFromEnv(): string {
  return normalizeAppBasePath(process.env.APP_BASE_PATH);
}

/** Whether a request path is owned by Nest (API, Loom, auth). */
export function isNestOwnedPath(
  url: string,
  options?: { includeNestHbsRoutes?: boolean },
): boolean {
  const path = (url.split('?')[0] ?? '').replace(/\/$/, '') || '/';
  const appBase = appBaseFromEnv();
  let rest = path;

  if (appBase) {
    if (path === appBase) {
      return options?.includeNestHbsRoutes === true;
    }
    if (!path.startsWith(`${appBase}/`)) {
      return false;
    }
    rest = path.slice(appBase.length) || '/';
  }

  const loomEnv = normalizeAppBasePath(process.env.LOOM_BASE_PATH);
  let adminRel = loomEnv || '/admin';
  if (appBase && adminRel.startsWith(appBase)) {
    adminRel = adminRel.slice(appBase.length) || '/';
  }
  if (!adminRel.startsWith('/')) adminRel = `/${adminRel}`;

  const nestOwned =
    rest === '/api' ||
    rest.startsWith('/api/') ||
    rest === adminRel ||
    rest.startsWith(`${adminRel}/`) ||
    rest === '/login' ||
    rest === '/logout' ||
    rest === '/account' ||
    rest.startsWith('/account/') ||
    rest === '/forgot-password' ||
    rest === '/reset-password';

  if (!nestOwned && options?.includeNestHbsRoutes) {
    return (
      rest === '/app' ||
      rest === '/assets' ||
      rest.startsWith('/assets/')
    );
  }

  return nestOwned;
}
