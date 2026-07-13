import type { FieldConfig } from './types.js';

export type LoomAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'bulkDelete'
  | 'export'
  | 'import';

export interface LoomAuditEvent {
  action: LoomAuditAction;
  resource: string;
  recordId?: string;
  recordIds?: string[];
  userId?: string;
  userEmail?: string;
  requestId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
  at: string;
}

export interface LoomAuditConfig {
  /** Default true when `audit` option is set. */
  enabled?: boolean;
  /** Called for each auditable mutation (create/update/delete/restore/bulk/export). */
  onAudit?: (event: LoomAuditEvent) => void | Promise<void>;
  /** Additional field names to strip from snapshots (password fields are always redacted). */
  redactFields?: string[];
}

export type LoomAuditOption = boolean | LoomAuditConfig;

export function resolveAuditConfig(audit: LoomAuditOption | undefined): LoomAuditConfig | null {
  if (audit === false || audit === undefined) return null;
  if (audit === true) return { enabled: true };
  if (audit.enabled === false) return null;
  return { enabled: true, ...audit };
}

export function redactAuditRecord(
  record: Record<string, unknown> | null | undefined,
  fields: FieldConfig[],
  extraRedact: string[] = [],
): Record<string, unknown> | null {
  if (!record) return null;
  const hidden = new Set([
    ...fields.filter((f) => f.type === 'password').map((f) => f.name),
    ...extraRedact,
    'password',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (hidden.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export async function emitLoomAudit(
  config: LoomAuditConfig | null,
  event: Omit<LoomAuditEvent, 'at'>,
): Promise<void> {
  if (!config?.onAudit) return;
  await config.onAudit({ ...event, at: new Date().toISOString() });
}
