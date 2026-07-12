import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { LoomAdapter } from '../adapters/adapter.js';
import { recordIdFrom } from '../adapters/adapter.js';
import {
  buildSessionCookie,
  getRequestCookie,
  hashPassword,
  isPasswordHashed,
  signSession,
  toAuthUser,
  verifyPassword,
  verifySession,
  type LoomAuthOptions,
  type LoomAuthUser,
} from '../core/auth.js';
import { LOOM_ABILITIES } from '../core/abilities.js';
import {
  buildCsrfCookie,
  createCsrfToken,
  csrfCookieName,
  isCsrfEnabled,
  parseSignedCsrfToken,
  readCsrfFromRequest,
  signCsrfToken,
  tokensMatch,
  LoomCsrfError,
} from '../core/csrf.js';
import { relationIdsFromValue } from '../core/relations.js';
import { ResourceRegistry } from '../core/registry.js';
import {
  LoginRateLimitError,
  LoginRateLimiter,
} from '../core/login-rate-limit.js';
import {
  LOOM_RBAC,
  type LoomRbacStore,
  createLoomRbacStore,
  createNoopRbacStore,
} from '../core/rbac-store.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';

@Injectable()
export class LoomAuthService implements OnModuleInit {
  private readonly logger = new Logger(LoomAuthService.name);
  private rbac: LoomRbacStore;
  private readonly loginLimiter: LoginRateLimiter | null;
  /** In-memory session versions (also persisted when `sessionVersion` field exists). */
  private readonly sessionVersions = new Map<string, number>();

  constructor(
    @Inject(LOOM_OPTIONS) private readonly options: LoomModuleOptions,
    @Inject(LOOM_ADAPTER) private readonly adapter: LoomAdapter,
    @Inject(LOOM_REGISTRY) private readonly registry: ResourceRegistry,
    @Optional() @Inject(LOOM_RBAC) rbacStore?: LoomRbacStore,
  ) {
    this.rbac =
      rbacStore ??
      (options.orm && options.dataSource !== undefined
        ? createLoomRbacStore(options.orm, options.dataSource)
        : createNoopRbacStore());
    const rate = options.auth?.loginRateLimit;
    this.loginLimiter =
      rate === false ? null : new LoginRateLimiter(rate === undefined ? {} : rate);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || this.options.auth?.skipRbacSync) {
      await this.seedAdminIfNeeded();
      return;
    }
    try {
      await this.syncPermissionsAndRoles();
    } catch (error) {
      this.logger.warn(
        `RBAC sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await this.seedAdminIfNeeded();
  }

  get enabled(): boolean {
    return Boolean(this.options.auth?.secret);
  }

  get authOptions(): LoomAuthOptions | undefined {
    return this.options.auth;
  }

  get loginPath(): string {
    return `${this.options.basePath ?? '/admin'}/login`;
  }

  get logoutPath(): string {
    return `${this.options.basePath ?? '/admin'}/logout`;
  }

  isPublicPath(pathname: string): boolean {
    const base = (this.options.basePath ?? '/admin').replace(/\/$/, '');
    const path = pathname.split('?')[0] ?? pathname;
    if (path === `${base}/login` || path.endsWith('/login')) return true;
    if (path.includes('/assets/')) return true;
    if (path === `${base}/logout` || path.endsWith('/logout')) return true;
    return false;
  }

  async resolveUserFromRequest(req: {
    headers?: Record<string, unknown>;
    cookies?: Record<string, string>;
  }): Promise<LoomAuthUser | null> {
    if (!this.enabled || !this.options.auth) return null;
    const cookieName = this.options.auth.cookieName ?? 'loom_session';
    const token = getRequestCookie(req, cookieName);
    const session = verifySession(token, this.options.auth.secret);
    if (!session) return null;
    const record = await this.findUserRecordById(session.sub);
    if (!record) return null;
    const currentSv = this.readSessionVersion(record, session.sub);
    const tokenSv = session.sv ?? 0;
    if (tokenSv !== currentSv) return null;
    return this.hydrateAuthUser(record);
  }

  async findUserById(id: string): Promise<LoomAuthUser | null> {
    const record = await this.findUserRecordById(id);
    return record ? this.hydrateAuthUser(record) : null;
  }

  private async findUserRecordById(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.options.auth) return null;
    const meta = this.userMeta();
    try {
      return await this.adapter.findOne(meta, id);
    } catch {
      return null;
    }
  }

  async authenticate(
    email: string,
    password: string,
    context?: { ip?: string },
  ): Promise<{
    user: LoomAuthUser;
    cookies: string[];
  } | null> {
    if (!this.options.auth) return null;
    const auth = this.options.auth;
    const normalizedEmail = email.trim().toLowerCase();
    const rateKey = `${context?.ip ?? 'unknown'}|${normalizedEmail || 'empty'}`;

    try {
      this.loginLimiter?.assertAllowed(rateKey);
    } catch (error) {
      if (error instanceof LoginRateLimitError) throw error;
      throw error;
    }

    const emailField = auth.emailField ?? 'email';
    const passwordField = auth.passwordField ?? 'password';
    const meta = this.userMeta();
    const record =
      (await this.adapter.findFirst(meta, { [emailField]: normalizedEmail })) ??
      (await this.findUserByEmailFallback(normalizedEmail));
    if (!record) {
      this.loginLimiter?.recordFailure(rateKey);
      return null;
    }

    const stored = String(record[passwordField] ?? '');
    const allowPlaintext =
      auth.allowPlaintextPasswords ?? process.env.NODE_ENV !== 'production';
    const ok = await verifyPassword(password, stored, { allowPlaintext });
    if (!ok) {
      this.loginLimiter?.recordFailure(rateKey);
      return null;
    }

    const user = await this.hydrateAuthUser(record);
    if (!user) {
      this.loginLimiter?.recordFailure(rateKey);
      return null;
    }

    this.loginLimiter?.recordSuccess(rateKey);

    if (stored && !isPasswordHashed(stored)) {
      try {
        await this.adapter.update(meta, recordIdFrom(record), {
          [passwordField]: await hashPassword(password),
        });
      } catch {
        // Best-effort upgrade
      }
    }

    const maxAgeMs = auth.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    const sv = this.readSessionVersion(record, user.id);
    const token = signSession(
      { sub: user.id, exp: Date.now() + maxAgeMs, sv },
      auth.secret,
    );
    const cookies = [buildSessionCookie(auth, token)];
    if (isCsrfEnabled(auth)) {
      cookies.push(this.issueCsrfCookie());
    }
    return { user, cookies };
  }

  clearSessionCookies(): string[] {
    if (!this.options.auth) {
      return ['loom_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'];
    }
    const cookies = [buildSessionCookie(this.options.auth, null)];
    if (isCsrfEnabled(this.options.auth)) {
      cookies.push(buildCsrfCookie(this.options.auth, null));
    }
    return cookies;
  }

  /** @deprecated use clearSessionCookies */
  clearSessionCookie(): string {
    return this.clearSessionCookies()[0] ?? '';
  }

  issueCsrfCookie(): string {
    if (!this.options.auth || !isCsrfEnabled(this.options.auth)) {
      return '';
    }
    const raw = createCsrfToken();
    const signed = signCsrfToken(raw, this.options.auth.secret);
    return buildCsrfCookie(this.options.auth, signed);
  }

  /**
   * Return the raw CSRF token for HTML embedding; optionally a Set-Cookie to issue.
   * @param issueIfMissing When false (unsafe methods), do not mint a new token.
   */
  ensureCsrf(
    req: {
      headers?: Record<string, unknown>;
      cookies?: Record<string, string>;
    },
    issueIfMissing = true,
  ): { token: string; setCookie?: string } {
    if (!this.options.auth || !isCsrfEnabled(this.options.auth)) {
      return { token: '' };
    }
    const name = csrfCookieName(this.options.auth);
    const cookie = getRequestCookie(req, name);
    const existing = parseSignedCsrfToken(cookie, this.options.auth.secret);
    if (existing) return { token: existing };
    if (!issueIfMissing) return { token: '' };
    const raw = createCsrfToken();
    const signed = signCsrfToken(raw, this.options.auth.secret);
    return {
      token: raw,
      setCookie: buildCsrfCookie(this.options.auth, signed),
    };
  }

  resolveCsrfToken(req: {
    headers?: Record<string, unknown>;
    cookies?: Record<string, string>;
  }): string {
    return this.ensureCsrf(req).token;
  }

  assertCsrf(req: {
    method?: string;
    headers?: Record<string, unknown>;
    cookies?: Record<string, string>;
    body?: Record<string, unknown>;
  }): void {
    if (!this.options.auth || !isCsrfEnabled(this.options.auth)) return;
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    const name = csrfCookieName(this.options.auth);
    const cookieRaw = getRequestCookie(req, name);
    const cookieToken = parseSignedCsrfToken(cookieRaw, this.options.auth.secret);
    const submitted = readCsrfFromRequest(req);
    if (!tokensMatch(cookieToken ?? undefined, submitted)) {
      throw new LoomCsrfError();
    }
  }

  async bumpSessionVersion(userId: string): Promise<number> {
    const field = this.options.auth?.sessionVersionField ?? 'sessionVersion';
    let current = this.sessionVersions.get(userId) ?? 0;
    try {
      const record = await this.findUserRecordById(userId);
      if (record) {
        current = Math.max(current, this.readSessionVersion(record, userId));
      }
      const next = current + 1;
      this.sessionVersions.set(userId, next);
      try {
        await this.adapter.update(this.userMeta(), userId, { [field]: next });
      } catch {
        // Column may not exist yet — memory map still revokes on this process.
      }
      return next;
    } catch {
      const next = current + 1;
      this.sessionVersions.set(userId, next);
      return next;
    }
  }

  private readSessionVersion(
    record: Record<string, unknown>,
    userId: string,
  ): number {
    const field = this.options.auth?.sessionVersionField ?? 'sessionVersion';
    const fromDb = Number(record[field] ?? 0);
    const dbVersion = Number.isFinite(fromDb) ? fromDb : 0;
    const fromMemory = this.sessionVersions.get(userId) ?? 0;
    return Math.max(dbVersion, fromMemory);
  }

  private async hydrateAuthUser(
    record: Record<string, unknown>,
  ): Promise<LoomAuthUser | null> {
    if (!this.options.auth) return null;
    const base = toAuthUser(record, this.options.auth);
    if (!base) return null;

    const roleIdsField = this.options.auth.roleIdsField ?? 'roleIds';
    const roleIds = [...relationIdsFromValue(record[roleIdsField])];

    // Legacy single role string → treat as role slug until migrated
    if (roleIds.length === 0 && base.role) {
      roleIds.push(String(base.role));
    }

    try {
      const loaded = await this.rbac.loadPermissionNamesForUser(base.id, roleIds);
      base.roles = loaded.roles.length > 0 ? loaded.roles : roleIds;
      base.permissions = loaded.permissions;
      if (base.permissions.includes('*') && !base.roles.includes('admin')) {
        // keep roles as-is
      }
      // Fallback: legacy admin role column with no RBAC rows yet
      if (
        (base.permissions?.length ?? 0) === 0 &&
        (base.role === 'admin' || roleIds.includes('admin'))
      ) {
        base.permissions = ['*'];
        base.roles = ['admin'];
      }
    } catch {
      if (base.role === 'admin') {
        base.permissions = ['*'];
        base.roles = ['admin'];
      }
    }

    return base;
  }

  private async syncPermissionsAndRoles(): Promise<void> {
    const names = new Set<string>(['*']);
    const labels = new Map<string, string>();

    for (const meta of this.registry.all()) {
      names.add(`${meta.slug}:*`);
      for (const ability of LOOM_ABILITIES) {
        names.add(`${meta.slug}:${ability}`);
      }
      for (const custom of meta.customPermissions ?? []) {
        names.add(custom.name);
        if (custom.label) labels.set(custom.name, custom.label);
      }
    }
    for (const extra of this.options.auth?.extraPermissions ?? []) {
      names.add(extra);
    }

    const permissionIdsByName = new Map<string, string>();
    for (const name of names) {
      const [resource, ability] = name === '*' ? ['*', '*'] : name.split(':');
      const record = await this.rbac.upsertPermission({
        name,
        resource: resource || '*',
        ability: ability || '*',
        label: labels.get(name),
      });
      permissionIdsByName.set(name, record.id || name);
    }

    const allIds = [...permissionIdsByName.values()];
    const admin = await this.rbac.upsertRole({
      name: 'Admin',
      slug: 'admin',
      description: 'Full access',
      permissionIds: [permissionIdsByName.get('*') ?? '*'],
    });

    const rbacSlugs = new Set(['users', 'roles', 'permissions']);
    const editorPerms: string[] = [];
    const viewerPerms: string[] = [];
    for (const name of names) {
      if (name === '*' || name.endsWith(':*') && name !== '*') {
        const resource = name.split(':')[0];
        if (resource && rbacSlugs.has(resource)) continue;
      }
      const [resource, ability] = name.split(':');
      if (!resource || rbacSlugs.has(resource)) continue;
      if (ability === 'viewAny' || ability === 'view') {
        viewerPerms.push(permissionIdsByName.get(name) ?? name);
      }
      if (['viewAny', 'view', 'create', 'edit', 'delete', '*'].includes(ability)) {
        editorPerms.push(permissionIdsByName.get(name) ?? name);
      }
    }

    const existingEditor = await this.rbac.findRoleBySlug('editor');
    await this.rbac.upsertRole({
      name: 'Editor',
      slug: 'editor',
      description: 'CRUD on application resources',
      permissionIds:
        existingEditor && existingEditor.permissionIds.length > 0
          ? existingEditor.permissionIds
          : editorPerms,
    });

    const existingViewer = await this.rbac.findRoleBySlug('viewer');
    await this.rbac.upsertRole({
      name: 'Viewer',
      slug: 'viewer',
      description: 'Read-only access',
      permissionIds:
        existingViewer && existingViewer.permissionIds.length > 0
          ? existingViewer.permissionIds
          : viewerPerms,
    });

    // Ensure admin always has *
    if (admin.permissionIds.length === 0) {
      await this.rbac.setRolePermissions(admin.id, [
        permissionIdsByName.get('*') ?? '*',
      ]);
    }

    this.logger.log(`Synced ${names.size} Loom permissions (${allIds.length} ids)`);
  }

  private async seedAdminIfNeeded(): Promise<void> {
    const auth = this.options.auth;
    const seed = auth?.seedAdmin;
    if (!auth?.secret || !seed?.email || !seed?.password) return;

    try {
      const meta = this.userMeta();
      const emailField = auth.emailField ?? 'email';
      const passwordField = auth.passwordField ?? 'password';
      const nameField = auth.nameField ?? 'name';
      const activeField = auth.activeField ?? 'active';
      const roleIdsField = auth.roleIdsField ?? 'roleIds';
      const email = seed.email.trim().toLowerCase();
      const roleSlug = seed.role ?? 'admin';

      const existing =
        (await this.adapter.findFirst(meta, { [emailField]: email })) ??
        (await this.findUserByEmailFallback(email));
      if (existing) {
        await this.rbac.assignRoleToUser(recordIdFrom(existing), roleSlug);
        return;
      }

      const adminRole = await this.rbac.findRoleBySlug(roleSlug);
      const created = await this.adapter.create(meta, {
        [nameField]: seed.name?.trim() || 'Admin',
        [emailField]: email,
        [passwordField]: await hashPassword(seed.password),
        [activeField]: true,
        [roleIdsField]: adminRole ? [adminRole.id] : [roleSlug],
      });
      await this.rbac.assignRoleToUser(recordIdFrom(created), roleSlug);
      this.logger.log(`Seeded Loom admin user ${email} (role: ${roleSlug})`);
    } catch (error) {
      this.logger.warn(
        `Could not seed Loom admin user: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private userMeta() {
    const slug = this.options.auth?.userResource ?? 'users';
    return this.registry.require(slug);
  }

  private async findUserByEmailFallback(
    email: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.options.auth) return null;
    const emailField = this.options.auth.emailField ?? 'email';
    const meta = this.userMeta();
    const result = await this.adapter.list(meta, {
      page: 1,
      perPage: 50,
      search: email,
    });
    return (
      result.items.find(
        (item) => String(item[emailField] ?? '').toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }
}
