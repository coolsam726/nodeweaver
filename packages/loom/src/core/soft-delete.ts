import type { ListQuery, ResourceMeta } from './types.js';

export type SoftDeleteConfig = {
  /** Column name (default `deletedAt`) */
  field?: string;
};

export type TrashedMode = false | true | 'only' | 'with';

/** Resolve soft-delete field name, or null when disabled. */
export function softDeleteField(meta: ResourceMeta): string | null {
  if (!meta.softDelete) return null;
  if (meta.softDelete === true) return 'deletedAt';
  return meta.softDelete.field ?? 'deletedAt';
}

export function softDeleteEnabled(meta: ResourceMeta): boolean {
  return softDeleteField(meta) != null;
}

/** Stamp payload for soft-delete (ISO timestamp). */
export function softDeleteStamp(meta: ResourceMeta): Record<string, unknown> | null {
  const field = softDeleteField(meta);
  if (!field) return null;
  return { [field]: new Date().toISOString() };
}

/** Clear soft-delete marker on restore. */
export function softDeleteClear(meta: ResourceMeta): Record<string, unknown> | null {
  const field = softDeleteField(meta);
  if (!field) return null;
  return { [field]: null };
}

/**
 * Equality-style filter fragment for list queries.
 * - default / false: only non-deleted (`field: null`)
 * - true / 'only': only deleted (adapters that need Not(IsNull) handle via `trashed`)
 * - 'with': no extra filter
 */
export function softDeleteListEquals(
  meta: ResourceMeta,
  trashed?: TrashedMode,
): Record<string, unknown> | undefined {
  const field = softDeleteField(meta);
  if (!field) return undefined;
  if (trashed === 'with') return undefined;
  if (trashed === true || trashed === 'only') {
    // Marker for adapters: include only rows where field is set
    return { [field]: { $loomTrashed: true } };
  }
  return { [field]: null };
}

export function normalizeTrashed(raw: unknown): TrashedMode {
  if (raw === true || raw === '1' || raw === 'true' || raw === 'only') return 'only';
  if (raw === 'with' || raw === 'all') return 'with';
  return false;
}

export function mergeSoftDeleteIntoQuery(
  meta: ResourceMeta,
  query: ListQuery,
): ListQuery {
  const equals = softDeleteListEquals(meta, query.trashed);
  if (!equals) return query;
  return {
    ...query,
    scope: {
      ...query.scope,
      equals: {
        ...(query.scope?.equals ?? {}),
        ...equals,
      },
    },
  };
}

/** True when an equals value is the trashed-only marker. */
export function isTrashedMarker(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { $loomTrashed?: boolean }).$loomTrashed === true,
  );
}
