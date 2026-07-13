import type { ActionConfig } from './actions.js';
import { bulkDeleteAction, exportAction, importAction } from './actions.js';
import type { ResourceMeta } from './types.js';
import { can } from './abilities.js';
import type { LoomAuthUser } from './auth.js';

export function resolveListActions(
  meta: ResourceMeta,
  basePath: string,
  user: LoomAuthUser | null,
  authEnabled: boolean,
  abilities: {
    canDelete: boolean;
    canViewAny: boolean;
    canView: boolean;
    canEdit: boolean;
    canCreate?: boolean;
  },
): {
  headerActions: ActionConfig[];
  bulkActions: ActionConfig[];
  recordActions: ActionConfig[];
  bulkEnabled: boolean;
} {
  const headerActions = meta.actions
    .filter((action) => action.placement === 'header' && action.type !== 'create')
    .map((action) => resolveActionUrl(action, basePath, meta.slug))
    .filter((action) => actionAllowed(action, meta.slug, user, authEnabled, abilities));

  const bulkActions = meta.actions
    .filter((action) => action.placement === 'bulk')
    .map((action) => resolveActionUrl(action, basePath, meta.slug))
    .filter((action) => actionAllowed(action, meta.slug, user, authEnabled, abilities));

  const recordActions = meta.actions
    .filter((action) => action.placement === 'row')
    .map((action) => resolveActionUrl(action, basePath, meta.slug))
    .filter((action) => actionAllowed(action, meta.slug, user, authEnabled, abilities));

  if (canExport(user, authEnabled, meta.slug, abilities.canViewAny)) {
    const hasExport = headerActions.some((action) => action.name === 'export');
    if (!hasExport) {
      headerActions.push(resolveActionUrl(exportAction().build(), basePath, meta.slug));
    }
  }

  if (canImport(user, authEnabled, meta.slug, abilities.canCreate === true)) {
    const hasImport = headerActions.some((action) => action.name === 'import');
    if (!hasImport) {
      headerActions.push(resolveActionUrl(importAction().build(), basePath, meta.slug));
    }
  }

  if (abilities.canDelete && !bulkActions.some((action) => action.name === 'delete')) {
    bulkActions.push(resolveActionUrl(bulkDeleteAction().build(), basePath, meta.slug));
  }

  return {
    headerActions,
    bulkActions,
    recordActions,
    bulkEnabled: bulkActions.length > 0,
  };
}

function actionAllowed(
  action: ActionConfig,
  slug: string,
  user: LoomAuthUser | null,
  authEnabled: boolean,
  abilities: {
    canDelete: boolean;
    canView: boolean;
    canEdit: boolean;
  },
): boolean {
  if (action.type === 'view' || action.ability === 'view') return abilities.canView;
  if (action.type === 'edit' || action.ability === 'edit') return abilities.canEdit;
  if (action.type === 'delete' || action.ability === 'delete' || action.name === 'delete') {
    return abilities.canDelete;
  }
  if (!action.ability) return true;
  if (!authEnabled) return true;
  if (!user) return false;
  return (
    can(user, `${slug}:${action.ability}`) ||
    can(user, `${slug}:*`) ||
    can(user, '*') ||
    can(user, `*:${action.ability}`)
  );
}

export function canExport(
  user: LoomAuthUser | null,
  authEnabled: boolean,
  slug: string,
  canViewAny: boolean,
): boolean {
  if (!authEnabled) return canViewAny;
  if (!user) return false;
  return can(user, `${slug}:export`) || can(user, `${slug}:*`) || can(user, '*') || canViewAny;
}

export function canImport(
  user: LoomAuthUser | null,
  authEnabled: boolean,
  slug: string,
  canCreate: boolean,
): boolean {
  if (!authEnabled) return canCreate;
  if (!user) return false;
  return (
    can(user, `${slug}:import`) ||
    can(user, `${slug}:*`) ||
    can(user, '*') ||
    can(user, `*:import`) ||
    canCreate
  );
}

function resolveActionUrl(
  action: ActionConfig,
  basePath: string,
  slug: string,
): ActionConfig {
  if (action.url === '__loom_export__') {
    return { ...action, url: `${basePath}/${slug}/export?format=csv` };
  }
  if (action.url === '__loom_import__') {
    return { ...action, url: `${basePath}/${slug}/import` };
  }
  if (action.url === '__loom_bulk_delete__' || action.url === '__loom_bulk__') {
    return {
      ...action,
      url: `${basePath}/${slug}/bulk`,
      method: action.method ?? 'POST',
    };
  }
  if (action.placement === 'bulk' && !action.url) {
    return {
      ...action,
      url: `${basePath}/${slug}/bulk`,
      method: action.method ?? 'POST',
    };
  }
  return action;
}

export function resourceHasMediaFields(meta: ResourceMeta): boolean {
  return meta.fields.some((field) => field.type === 'file' || field.type === 'image');
}
