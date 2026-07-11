import type { ResourceMeta } from './types.js';

const DEFAULT_DISPLAY_FIELDS = ['name', 'title', 'email'] as const;

function recordId(record: Record<string, unknown>): string {
  const id = record.id ?? record._id;
  if (id === undefined || id === null || id === '') return '';
  return String(id);
}

/**
 * Compute a human-readable display name for a record.
 * Prefers `preferredField` (e.g. resource `recordTitleField`), then `name`, `title`, `email`, then `#id`.
 */
export function computeDisplayName(
  record: Record<string, unknown>,
  preferredField?: string,
): string {
  if (preferredField && preferredField !== 'displayName') {
    const preferred = record[preferredField];
    if (preferred !== undefined && preferred !== null && preferred !== '') {
      return String(preferred);
    }
  }

  for (const key of DEFAULT_DISPLAY_FIELDS) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }

  const existing = record.displayName;
  if (existing !== undefined && existing !== null && existing !== '') {
    return String(existing);
  }

  const id = recordId(record);
  return id ? `#${id}` : '';
}

/** Attach a computed `displayName` onto a record (non-destructive copy). */
export function withDisplayName(
  record: Record<string, unknown>,
  preferredField?: string,
): Record<string, unknown> {
  return {
    ...record,
    displayName: computeDisplayName(record, preferredField),
  };
}

export function withDisplayNameFromMeta(
  record: Record<string, unknown>,
  meta: Pick<ResourceMeta, 'recordTitleField' | 'singularLabel'>,
): Record<string, unknown> {
  const displayName =
    computeDisplayName(record, meta.recordTitleField) || meta.singularLabel;
  return { ...record, displayName };
}
