import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

/** Built-in role slugs (DB roles; not a column on users) */
export type LoomRole = 'admin' | 'editor' | 'viewer' | (string & {});

export type LoomAbility = 'viewAny' | 'view' | 'create' | 'edit' | 'delete';

export interface LoomAuthUser {
  id: string;
  name: string;
  email: string;
  /** @deprecated Prefer `roles` + `permissions` from RBAC */
  role?: LoomRole;
  /** Role slugs assigned to the user */
  roles?: string[];
  /** Flattened permission names from all roles, e.g. `users:viewAny`, `*` */
  permissions?: string[];
  companyId?: string;
  avatar?: string;
  active?: boolean;
}

export interface LoomAuthOptions {
  /** HMAC secret for signed session cookies (required when auth is enabled) */
  secret: string;
  /** Cookie name (default: `loom_session`) */
  cookieName?: string;
  /** Session lifetime in ms (default: 7 days) */
  maxAgeMs?: number;
  /** Resource slug used to look up panel users (default: `users`) */
  userResource?: string;
  emailField?: string;
  passwordField?: string;
  /** @deprecated Single-role field; prefer RBAC roleIds */
  roleField?: string;
  permissionsField?: string;
  nameField?: string;
  activeField?: string;
  companyIdField?: string;
  /** User field holding role ids (default: `roleIds`) */
  roleIdsField?: string;
  /** Secure cookie flag (default: true in production) */
  secure?: boolean;
  /**
   * Create this admin user on boot if it does not already exist.
   * Assigns the `admin` role when RBAC is available.
   */
  seedAdmin?: {
    email: string;
    password: string;
    name?: string;
    /** Role slug to assign (default: `admin`) */
    role?: string;
  };
  /** Extra permission names to sync (API-only, no Resource) */
  extraPermissions?: string[];
  /** Policies keyed by resource slug (for API-only domains) */
  policies?: Record<string, import('./policy.js').PolicyClass>;
  /** Skip automatic permission/role sync */
  skipRbacSync?: boolean;
}

export interface LoomSessionPayload {
  sub: string;
  exp: number;
}

export interface LoomAuthStore {
  user: LoomAuthUser | null;
}

export const loomAuthAls = new AsyncLocalStorage<LoomAuthStore>();

export function currentLoomUser(): LoomAuthUser | null {
  return loomAuthAls.getStore()?.user ?? null;
}

export function runWithLoomAuth<T>(user: LoomAuthUser | null, fn: () => T): T {
  return loomAuthAls.run({ user }, fn);
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  // Legacy/plaintext bootstrap (upgrade on next successful login)
  if (!stored.startsWith('scrypt$')) {
    const a = Buffer.from(password);
    const b = Buffer.from(stored);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, salt, hash] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !hash) {
    return false;
  }

  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N, r, p });
  const expected = Buffer.from(hash, 'base64url');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function isPasswordHashed(stored: string | undefined | null): boolean {
  return Boolean(stored?.startsWith('scrypt$'));
}

export function signSession(payload: LoomSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
): LoomSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LoomSessionPayload;
    if (!payload?.sub || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getRequestCookie(req: { headers?: Record<string, unknown>; cookies?: Record<string, string> }, name: string): string | undefined {
  if (req.cookies?.[name]) return req.cookies[name];
  const header = req.headers?.cookie ?? req.headers?.Cookie;
  if (typeof header !== 'string') return undefined;
  return parseCookies(header)[name];
}

export function buildSessionCookie(
  options: LoomAuthOptions,
  token: string | null,
): string {
  const name = options.cookieName ?? 'loom_session';
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const secure =
    options.secure ?? (process.env.NODE_ENV === 'production');
  const parts = [
    `${name}=${token ? encodeURIComponent(token) : ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${token ? Math.floor(maxAgeMs / 1000) : 0}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function toAuthUser(
  record: Record<string, unknown>,
  options: LoomAuthOptions,
): LoomAuthUser | null {
  const id = String(record.id ?? record._id ?? '');
  if (!id) return null;

  const emailField = options.emailField ?? 'email';
  const nameField = options.nameField ?? 'name';
  const roleField = options.roleField ?? 'role';
  const permissionsField = options.permissionsField ?? 'permissions';
  const activeField = options.activeField ?? 'active';
  const companyIdField = options.companyIdField ?? 'companyId';

  const active = record[activeField];
  if (active === false || active === 'false' || active === 0) {
    return null;
  }

  const permissionsRaw = record[permissionsField];
  let permissions: string[] | undefined;
  if (Array.isArray(permissionsRaw)) {
    permissions = permissionsRaw.map(String);
  } else if (typeof permissionsRaw === 'string' && permissionsRaw.trim()) {
    try {
      const parsed = JSON.parse(permissionsRaw) as unknown;
      if (Array.isArray(parsed)) permissions = parsed.map(String);
      else permissions = permissionsRaw.split(',').map((p) => p.trim()).filter(Boolean);
    } catch {
      permissions = permissionsRaw.split(',').map((p) => p.trim()).filter(Boolean);
    }
  }

  return {
    id,
    name: String(record[nameField] ?? record.email ?? 'User'),
    email: String(record[emailField] ?? ''),
    role: record[roleField] != null ? (String(record[roleField]) as LoomRole) : undefined,
    roles: Array.isArray(record.roles) ? record.roles.map(String) : undefined,
    permissions,
    companyId: record[companyIdField] != null ? String(record[companyIdField]) : undefined,
    avatar: typeof record.avatar === 'string' ? record.avatar : undefined,
    active: true,
  };
}

export const LOOM_AUTH = Symbol('LOOM_AUTH');
export const LOOM_ROLES = ['admin', 'editor', 'viewer'] as const;

export const LOOM_ROLE_OPTIONS = [
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
  { label: 'Viewer', value: 'viewer' },
];
