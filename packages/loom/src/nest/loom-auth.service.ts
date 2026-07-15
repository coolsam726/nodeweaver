import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { LoomAdapter } from '../adapters/adapter.js';
import { recordIdFrom } from '../adapters/adapter.js';
import { warnLoomDeprecated } from '../core/deprecation.js';
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
import {
  isAdmin,
  LoomAuthorizationError,
  LOOM_ABILITIES,
} from '../core/abilities.js';
import {
  LOOM_ALL_COMPANIES,
  membershipCompanyIds,
  resolveDefaultCompanyId,
  tenancyCompanyResource,
  tenancyEnabled,
  tenancyMembershipField,
  type LoomTenancyConfig,
} from '../core/tenancy.js';
import {
  defaultAdminBasePath,
  defaultCookiePath,
  joinAppPath,
  normalizeAppBasePath,
} from '../core/app-path.js';
import type { LoomCompany } from '../core/types.js';
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
import {
  createPasswordResetStore,
  type PasswordResetStore,
} from '../core/password-reset.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';

const GENERIC_RESET_MESSAGE =
  'If an account exists for that email, password reset instructions have been sent.';

@Injectable()
export class LoomAuthService implements OnModuleInit {
  private readonly logger = new Logger(LoomAuthService.name);
  private rbac: LoomRbacStore;
  private readonly loginLimiter: LoginRateLimiter | null;
  /** In-memory session versions (also persisted when `sessionVersion` field exists). */
  private readonly sessionVersions = new Map<string, number>();
  private readonly passwordResets: PasswordResetStore = createPasswordResetStore();

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
    return joinAppPath(this.appBasePath, 'login');
  }

  get logoutPath(): string {
    return joinAppPath(this.appBasePath, 'logout');
  }

  get accountPath(): string {
    return joinAppPath(this.appBasePath, 'account');
  }

  get changePasswordPath(): string {
    return joinAppPath(this.appBasePath, 'account/password');
  }

  get forgotPasswordPath(): string {
    return joinAppPath(this.appBasePath, 'forgot-password');
  }

  get resetPasswordPath(): string {
    return joinAppPath(this.appBasePath, 'reset-password');
  }

  /** Where signed-in users land after visiting auth pages without a redirect. */
  get postLoginPath(): string {
    return this.options.basePath ?? defaultAdminBasePath(this.appBasePath);
  }

  private get appBasePath(): string {
    return normalizeAppBasePath(this.options.appBasePath);
  }

  isPublicPath(pathname: string): boolean {
    const path = pathname.split('?')[0] ?? pathname;
    if (path === this.loginPath || path.endsWith('/login')) return true;
    if (path === this.forgotPasswordPath || path.endsWith('/forgot-password')) {
      return true;
    }
    if (path === this.resetPasswordPath || path.endsWith('/reset-password')) {
      return true;
    }
    if (path.includes('/assets/')) return true;
    if (path === this.logoutPath || path.endsWith('/logout')) return true;
    return false;
  }

  get passwordResetEnabled(): boolean {
    return this.enabled && this.options.auth?.passwordReset !== false;
  }

  /**
   * Request a password reset. Always returns a generic message (no email enumeration).
   * Rate-limited with the same IP+email limiter as login.
   */
  async requestPasswordReset(
    email: string,
    options?: { ip?: string; resetBaseUrl?: string },
  ): Promise<{ message: string }> {
    if (!this.options.auth || !this.passwordResetEnabled) {
      return { message: GENERIC_RESET_MESSAGE };
    }
    const normalized = email.trim().toLowerCase();
    const key = `${options?.ip ?? 'unknown'}|reset:${normalized || 'empty'}`;
    this.loginLimiter?.assertAllowed(key);

    if (!normalized) {
      this.loginLimiter?.recordSuccess(key);
      return { message: GENERIC_RESET_MESSAGE };
    }

    try {
      const emailField = this.options.auth.emailField ?? 'email';
      const meta = this.userMeta();
      const record = await this.adapter.findFirst(meta, {
        [emailField]: normalized,
      });

      if (record) {
        const user = await this.hydrateAuthUser(record);
        if (user) {
          const cfg =
            typeof this.options.auth.passwordReset === 'object'
              ? this.options.auth.passwordReset
              : {};
          const ttl = cfg.tokenTtlMs ?? 60 * 60 * 1000;
          const token = this.passwordResets.create(user.id, ttl);
          const base =
            (cfg.publicBaseUrl ?? options?.resetBaseUrl ?? '').replace(/\/$/, '');
          const resetPath = this.resetPasswordPath;
          const resetUrl = base
            ? `${base}${resetPath}?token=${encodeURIComponent(token)}`
            : `${resetPath}?token=${encodeURIComponent(token)}`;

          if (cfg.sendPasswordResetEmail) {
            await cfg.sendPasswordResetEmail({
              to: user.email,
              resetUrl,
              user,
            });
          } else if (process.env.NODE_ENV !== 'production') {
            this.logger.warn(
              `Password reset for ${user.email} (no mailer configured): ${resetUrl}`,
            );
          }
        }
      }
      this.loginLimiter?.recordSuccess(key);
    } catch (error) {
      if (error instanceof LoginRateLimitError) throw error;
      this.loginLimiter?.recordFailure(key);
      this.logger.warn(
        `Password reset request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { message: GENERIC_RESET_MESSAGE };
  }

  /** Validate a reset token without consuming it (for the reset form). */
  peekPasswordResetToken(token: string): { userId: string } | null {
    if (!this.passwordResetEnabled) return null;
    const entry = this.passwordResets.peek(token.trim());
    return entry ? { userId: entry.userId } : null;
  }

  /**
   * Consume a reset token and set a new password. Revokes existing sessions.
   */
  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.options.auth || !this.passwordResetEnabled) {
      return { ok: false, message: 'Password reset is not available' };
    }
    const password = String(newPassword ?? '');
    if (password.length < 8) {
      return { ok: false, message: 'Password must be at least 8 characters' };
    }
    const userId = this.passwordResets.consume(token.trim());
    if (!userId) {
      return { ok: false, message: 'This reset link is invalid or has expired' };
    }
    const passwordField = this.options.auth.passwordField ?? 'password';
    try {
      await this.adapter.update(this.userMeta(), userId, {
        [passwordField]: await hashPassword(password),
      });
      await this.bumpSessionVersion(userId);
      return { ok: true };
    } catch (error) {
      this.logger.warn(
        `Password reset failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, message: 'Could not update password' };
    }
  }

  /**
   * Update the signed-in user's name/email on the users resource.
   */
  async updateProfile(
    userId: string,
    input: { name?: string; email?: string },
  ): Promise<{ ok: true; user: LoomAuthUser } | { ok: false; message: string }> {
    if (!this.options.auth) {
      return { ok: false, message: 'Authentication is not configured' };
    }
    const nameField = this.options.auth.nameField ?? 'name';
    const emailField = this.options.auth.emailField ?? 'email';
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    if (!name) {
      return { ok: false, message: 'Name is required' };
    }
    if (!email || !email.includes('@')) {
      return { ok: false, message: 'A valid email is required' };
    }

    const meta = this.userMeta();
    try {
      const existing = await this.adapter.findFirst(meta, { [emailField]: email });
      if (existing && recordIdFrom(existing) !== userId) {
        return { ok: false, message: 'That email is already in use' };
      }
      const updated = await this.adapter.update(meta, userId, {
        [nameField]: name,
        [emailField]: email,
      });
      const user = await this.hydrateAuthUser(updated);
      if (!user) {
        return { ok: false, message: 'Could not update profile' };
      }
      return { ok: true, user };
    } catch (error) {
      this.logger.warn(
        `Profile update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, message: 'Could not update profile' };
    }
  }

  /**
   * Change password for the signed-in user (requires current password).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.options.auth) {
      return { ok: false, message: 'Authentication is not configured' };
    }
    const password = String(newPassword ?? '');
    if (password.length < 8) {
      return { ok: false, message: 'Password must be at least 8 characters' };
    }
    const record = await this.findUserRecordById(userId);
    if (!record) {
      return { ok: false, message: 'User not found' };
    }
    const passwordField = this.options.auth.passwordField ?? 'password';
    const stored = String(record[passwordField] ?? '');
    const allowPlaintext =
      this.options.auth.allowPlaintextPasswords ?? process.env.NODE_ENV !== 'production';
    const ok = await verifyPassword(String(currentPassword ?? ''), stored, {
      allowPlaintext,
    });
    if (!ok) {
      return { ok: false, message: 'Current password is incorrect' };
    }
    try {
      await this.adapter.update(this.userMeta(), userId, {
        [passwordField]: await hashPassword(password),
      });
      await this.bumpSessionVersion(userId);
      return { ok: true };
    } catch (error) {
      this.logger.warn(
        `Password change failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, message: 'Could not update password' };
    }
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
    return this.hydrateAuthUser(record, session.companyId);
  }

  async findUserById(id: string): Promise<LoomAuthUser | null> {
    const record = await this.findUserRecordById(id);
    return record ? this.hydrateAuthUser(record) : null;
  }

  get tenancy(): LoomTenancyConfig | undefined {
    const tenancy = this.options.auth?.tenancy;
    return tenancyEnabled(tenancy) ? tenancy : undefined;
  }

  get tenancyActive(): boolean {
    return Boolean(this.tenancy);
  }

  /**
   * Companies the user may switch into (for the topbar + API).
   * Admins see all companies from the companies resource (or options.companies).
   */
  async listSwitchableCompanies(
    user: LoomAuthUser | null | undefined,
  ): Promise<LoomCompany[]> {
    const brandingById = new Map(
      (this.options.companies ?? []).map((c) => [c.id, c] as const),
    );
    const mergeBranding = (id: string, name: string): LoomCompany => {
      const fromOpts = brandingById.get(id);
      return {
        id,
        name: fromOpts?.name ?? name,
        branding: fromOpts?.branding,
      };
    };

    if (!this.tenancy || !user) {
      return this.options.companies ?? [];
    }

    const config = this.tenancy;
    const labelField = config.companyLabelField ?? 'name';
    const companySlug = tenancyCompanyResource(config);

    let rows: Record<string, unknown>[] = [];
    try {
      const meta = this.registry.require(companySlug);
      const page = await this.adapter.list(meta, { page: 1, perPage: 500 });
      rows = page.items ?? [];
    } catch {
      return this.options.companies ?? [];
    }

    const mapped = rows.map((row) => {
      const id = recordIdFrom(row) || String(row.id ?? row._id ?? '');
      const name = String(row[labelField] ?? row.name ?? id);
      return mergeBranding(id, name);
    }).filter((c) => c.id);

    if (isAdmin(user)) return mapped;

    const userRecord = (await this.findUserRecordById(user.id)) ?? {};
    const allowed = new Set(
      membershipCompanyIds(
        userRecord,
        user.homeCompanyId,
        tenancyMembershipField(config),
      ),
    );
    return mapped.filter((c) => allowed.has(c.id));
  }

  /**
   * Switch active company in the session cookie. Pass empty string for admin "all".
   */
  async switchCompany(
    user: LoomAuthUser,
    companyId: string | null,
  ): Promise<{ user: LoomAuthUser; cookies: string[] }> {
    if (!this.options.auth || !this.tenancy) {
      throw new Error('Company tenancy is not enabled');
    }

    const record = await this.findUserRecordById(user.id);
    if (!record) throw new Error('User not found');

    const normalized =
      companyId == null || companyId === LOOM_ALL_COMPANIES
        ? LOOM_ALL_COMPANIES
        : String(companyId);

    if (normalized === LOOM_ALL_COMPANIES) {
      if (!isAdmin(user)) {
        throw new LoomAuthorizationError('Only super admins can view all companies');
      }
    } else if (isAdmin(user)) {
      try {
        const meta = this.registry.require(tenancyCompanyResource(this.tenancy));
        await this.adapter.findOne(meta, normalized);
      } catch {
        throw new LoomAuthorizationError('Unknown company');
      }
    } else {
      const allowed = membershipCompanyIds(
        record,
        user.homeCompanyId,
        tenancyMembershipField(this.tenancy),
      );
      if (!allowed.includes(normalized)) {
        throw new LoomAuthorizationError('You cannot switch to that company');
      }
    }

    const sv = this.readSessionVersion(record, user.id);
    const cookies = this.buildSessionCookies(user.id, sv, normalized);
    const hydrated = await this.hydrateAuthUser(record, normalized);
    if (!hydrated) throw new Error('Failed to hydrate user');
    return { user: hydrated, cookies };
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
    const record = await this.adapter.findFirst(meta, {
      [emailField]: normalizedEmail,
    });
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
    // Super admins may start unscoped ("all companies"). Non-admins always
    // get a concrete membership company when one exists — never "all".
    const sessionCompanyId = this.tenancy
      ? isAdmin(user)
        ? (user.companyId ?? LOOM_ALL_COMPANIES)
        : user.companyId
      : undefined;
    const token = signSession(
      {
        sub: user.id,
        exp: Date.now() + maxAgeMs,
        sv,
        ...(sessionCompanyId !== undefined ? { companyId: sessionCompanyId } : {}),
      },
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
      const path = defaultCookiePath(this.appBasePath);
      return [`loom_session=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`];
    }
    const cookies = [buildSessionCookie(this.options.auth, null)];
    if (isCsrfEnabled(this.options.auth)) {
      cookies.push(buildCsrfCookie(this.options.auth, null));
    }
    return cookies;
  }

  /** @deprecated use clearSessionCookies */
  clearSessionCookie(): string {
    warnLoomDeprecated(
      'clearSessionCookie',
      'LoomAuthService.clearSessionCookie() is deprecated; use clearSessionCookies() instead.',
    );
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

  private buildSessionCookies(
    userId: string,
    sv: number,
    companyId?: string,
  ): string[] {
    const auth = this.options.auth;
    if (!auth) return [];
    const maxAgeMs = auth.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    const token = signSession(
      {
        sub: userId,
        exp: Date.now() + maxAgeMs,
        sv,
        ...(companyId !== undefined ? { companyId } : {}),
      },
      auth.secret,
    );
    const cookies = [buildSessionCookie(auth, token)];
    if (isCsrfEnabled(auth)) {
      cookies.push(this.issueCsrfCookie());
    }
    return cookies;
  }

  private async hydrateAuthUser(
    record: Record<string, unknown>,
    sessionCompanyId?: string,
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

    this.applyTenancyCompany(base, record, sessionCompanyId);
    return base;
  }

  private applyTenancyCompany(
    user: LoomAuthUser,
    record: Record<string, unknown>,
    sessionCompanyId?: string,
  ): void {
    if (!this.tenancy) return;

    const membershipField = tenancyMembershipField(this.tenancy);
    const allowed = membershipCompanyIds(
      record,
      user.homeCompanyId,
      membershipField,
    );
    const defaultCompany = resolveDefaultCompanyId(
      record,
      user.homeCompanyId,
      membershipField,
    );

    if (isAdmin(user)) {
      if (sessionCompanyId === LOOM_ALL_COMPANIES) {
        user.companyId = undefined;
        return;
      }
      if (sessionCompanyId) {
        user.companyId = sessionCompanyId;
        return;
      }
      // Prefer explicit default/home company; otherwise leave unscoped ("all")
      user.companyId = defaultCompany;
      return;
    }

    // Non-admins always resolve to a concrete company from memberships.
    if (
      sessionCompanyId &&
      sessionCompanyId !== LOOM_ALL_COMPANIES &&
      allowed.includes(sessionCompanyId)
    ) {
      user.companyId = sessionCompanyId;
      return;
    }
    user.companyId = defaultCompany;
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

      const existing = await this.adapter.findFirst(meta, { [emailField]: email });
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
}
