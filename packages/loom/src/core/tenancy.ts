import type { LoomAuthUser } from './auth.js';
import { isAdmin } from './abilities.js';
import type { LoomQueryScope } from './policy.js';
import { relationIdsFromValue } from './relations.js';
import type { ResourceMeta } from './types.js';

export type LoomTenancyConfig = {
  /** Enable company tenancy (default true when `tenancy` object is set) */
  enabled?: boolean;
  /** FK field on tenant-scoped records (default `companyId`) */
  companyField?: string;
  /** Resource slug for the companies catalog (default `companies`) */
  companyResource?: string;
  /**
   * User field holding allowed company ids for the switcher (default `companyIds`).
   * Set `false` to allow only the home `companyId` (no membership list).
   */
  membershipField?: string | false;
  /** Label field on company records for the switcher (default `name`) */
  companyLabelField?: string;
};

export function tenancyEnabled(
  tenancy: false | LoomTenancyConfig | undefined,
): tenancy is LoomTenancyConfig {
  if (tenancy === false || tenancy == null) return false;
  return tenancy.enabled !== false;
}

export function tenancyCompanyField(config?: LoomTenancyConfig): string {
  return config?.companyField ?? 'companyId';
}

export function tenancyCompanyResource(config?: LoomTenancyConfig): string {
  return config?.companyResource ?? 'companies';
}

/** Resolved membership field, or undefined when home-company-only. */
export function tenancyMembershipField(
  config?: LoomTenancyConfig,
): string | undefined {
  if (config?.membershipField === false) return undefined;
  if (typeof config?.membershipField === 'string' && config.membershipField.trim()) {
    return config.membershipField.trim();
  }
  return 'companyIds';
}

/** Resource opts into company scoping via `companyScoped` / `companyField`. */
export function resourceCompanyField(
  meta: ResourceMeta,
  config?: LoomTenancyConfig,
): string | null {
  if (meta.companyField) return meta.companyField;
  if (meta.companyScoped) return config?.companyField ?? 'companyId';
  return null;
}

/**
 * List/IDOR scope for the active company.
 * Admins with no active company (session "all") are unscoped.
 */
export function companyScopeForUser(
  user: LoomAuthUser | null | undefined,
  companyField: string,
): LoomQueryScope | undefined {
  if (!user) return { equals: { [companyField]: '__loom_no_company__' } };
  if (isAdmin(user) && !user.companyId) return undefined;
  if (!user.companyId) {
    return { equals: { [companyField]: '__loom_no_company__' } };
  }
  return { equals: { [companyField]: user.companyId } };
}

export function recordMatchesCompany(
  record: Record<string, unknown>,
  companyField: string,
  companyId: string | undefined,
  user: LoomAuthUser | null | undefined,
): boolean {
  if (user && isAdmin(user) && !companyId) return true;
  if (!companyId) return false;
  const value = record[companyField];
  if (value == null) return false;
  return String(value) === String(companyId);
}

/** Merge equality scopes (later keys win on conflict). */
export function mergeQueryScopes(
  ...scopes: Array<LoomQueryScope | undefined>
): LoomQueryScope | undefined {
  const equals: Record<string, unknown> = {};
  let any = false;
  for (const scope of scopes) {
    if (!scope?.equals) continue;
    any = true;
    Object.assign(equals, scope.equals);
  }
  return any ? { equals } : undefined;
}

/** Session marker for admin "all companies" (unscoped). */
export const LOOM_ALL_COMPANIES = '';

/**
 * Companies the user may activate in the switcher.
 * Always unions home `companyId` into the membership list when present.
 */
export function membershipCompanyIds(
  record: Record<string, unknown>,
  homeCompanyId: string | undefined,
  membershipField?: string,
): string[] {
  const ids: string[] = [];
  if (membershipField) {
    ids.push(
      ...relationIdsFromValue(record[membershipField]).map((id) => String(id)),
    );
  }
  if (homeCompanyId) {
    ids.push(String(homeCompanyId));
  }
  return [...new Set(ids)];
}

/**
 * Default company for tenancy: home `companyId` when it is in the membership
 * list, otherwise the first membership id.
 */
export function resolveDefaultCompanyId(
  record: Record<string, unknown>,
  homeCompanyId: string | undefined,
  membershipField?: string,
): string | undefined {
  const allowed = membershipCompanyIds(record, homeCompanyId, membershipField);
  if (homeCompanyId && allowed.includes(String(homeCompanyId))) {
    return String(homeCompanyId);
  }
  return allowed[0];
}
