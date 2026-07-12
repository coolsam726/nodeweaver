import { SetMetadata } from '@nestjs/common';
import type { LoomAbility } from '../core/auth.js';
import { warnLoomDeprecated } from '../core/deprecation.js';

export const LOOM_PUBLIC_KEY = 'loom:public';
export const LOOM_ABILITY_KEY = 'loom:ability';
export const LOOM_PERMISSION_KEY = 'loom:permission';

/** Mark a route as public (no session required when auth is enabled). */
export const LoomPublic = () => SetMetadata(LOOM_PUBLIC_KEY, true);

export interface LoomAbilityRequirement {
  resource: string;
  ability: LoomAbility;
}

/** @deprecated Prefer RequirePermission — expands to `${resource}:${ability}` */
export const RequireLoomAbility = (resource: string, ability: LoomAbility) => {
  warnLoomDeprecated(
    'RequireLoomAbility',
    '@RequireLoomAbility is deprecated; use @RequirePermission("resource:ability") instead.',
  );
  return SetMetadata(LOOM_ABILITY_KEY, { resource, ability } satisfies LoomAbilityRequirement);
};

/**
 * Require one or more permission names (any match).
 * Wildcard-aware via `can()`.
 *
 * @example `@RequirePermission('orders:viewAny')`
 * @example `@RequirePermission(['orders:edit', 'orders:*'])`
 */
export const RequirePermission = (permission: string | string[]) =>
  SetMetadata(
    LOOM_PERMISSION_KEY,
    Array.isArray(permission) ? permission : [permission],
  );
