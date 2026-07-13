import type { LoomAuthUser } from './auth.js';
import type { LoomAdapter } from '../adapters/adapter.js';

export type ActionColor = 'primary' | 'accent' | 'danger' | 'gray';
export type ActionStyle = 'button' | 'link' | 'icon';

export interface BulkActionContext {
  user: LoomAuthUser | null;
  slug: string;
  adapter: LoomAdapter;
  dataSource?: unknown;
}

export type BulkActionHandler = (
  ids: string[],
  context: BulkActionContext,
) =>
  | Promise<{ ok?: boolean; message?: string; affected?: number }>
  | { ok?: boolean; message?: string; affected?: number };

export interface ActionConfig {
  name: string;
  label: string;
  color?: ActionColor;
  style?: ActionStyle;
  icon?: string;
  url?: string;
  method?: 'GET' | 'POST';
  confirm?: string;
  /** header | row | bulk */
  placement: 'header' | 'row' | 'bulk';
  /** Built-in: create, edit, view, delete — or custom name */
  type?: 'create' | 'edit' | 'view' | 'delete' | 'custom';
  /**
   * Permission ability checked as `{slug}:{ability}` (e.g. `archive` → `deals:archive`).
   * Delete uses `delete` / `canDelete` when omitted.
   */
  ability?: string;
}

abstract class ActionBase<T extends ActionConfig> {
  protected config: T;

  protected constructor(config: T) {
    this.config = config;
  }

  label(value: string): this {
    this.config.label = value;
    return this;
  }

  color(value: ActionColor): this {
    this.config.color = value;
    return this;
  }

  icon(value: string): this {
    this.config.icon = value;
    return this;
  }

  url(value: string): this {
    this.config.url = value;
    return this;
  }

  confirm(value: string): this {
    this.config.confirm = value;
    return this;
  }

  /** Gate this action behind `{slug}:{ability}` (also seed via `permissions()`). */
  ability(value: string): this {
    this.config.ability = value;
    return this;
  }

  build(): T {
    return { ...this.config };
  }
}

export class Action extends ActionBase<ActionConfig> {
  private bulkHandler?: BulkActionHandler;

  private constructor(config: ActionConfig) {
    super(config);
  }

  static make(name: string): Action {
    return new Action({
      name,
      label: humanize(name),
      placement: 'row',
      style: 'button',
      color: 'gray',
      type: 'custom',
    });
  }

  header(): this {
    this.config.placement = 'header';
    return this;
  }

  row(): this {
    this.config.placement = 'row';
    return this;
  }

  bulk(): this {
    this.config.placement = 'bulk';
    return this;
  }

  link(): this {
    this.config.style = 'link';
    return this;
  }

  method(value: 'GET' | 'POST'): this {
    this.config.method = value;
    return this;
  }

  /**
   * Inline bulk handler (preferred DX). Runs with adapter + user context.
   * `Resource.handleBulkAction` remains as a fallback for DI-heavy cases.
   */
  handle(handler: BulkActionHandler): this {
    this.bulkHandler = handler;
    this.config.placement = 'bulk';
    this.config.method = this.config.method ?? 'POST';
    return this;
  }

  getHandler(): BulkActionHandler | undefined {
    return this.bulkHandler;
  }
}

export class CreateAction extends ActionBase<ActionConfig> {
  private constructor() {
    super({
      name: 'create',
      label: 'Create',
      placement: 'header',
      style: 'button',
      color: 'primary',
      type: 'create',
    });
  }

  static make(): CreateAction {
    return new CreateAction();
  }
}

export class EditAction extends ActionBase<ActionConfig> {
  private constructor() {
    super({
      name: 'edit',
      label: 'Edit',
      placement: 'row',
      style: 'link',
      color: 'primary',
      type: 'edit',
      ability: 'edit',
    });
  }

  static make(): EditAction {
    return new EditAction();
  }
}

export class ViewAction extends ActionBase<ActionConfig> {
  private constructor() {
    super({
      name: 'view',
      label: 'View',
      placement: 'row',
      style: 'link',
      color: 'primary',
      type: 'view',
      ability: 'view',
    });
  }

  static make(): ViewAction {
    return new ViewAction();
  }
}

export class DeleteAction extends ActionBase<ActionConfig> {
  private constructor() {
    super({
      name: 'delete',
      label: 'Delete',
      placement: 'row',
      style: 'link',
      color: 'danger',
      type: 'delete',
      ability: 'delete',
      confirm: 'Delete this record?',
      method: 'POST',
    });
  }

  static make(): DeleteAction {
    return new DeleteAction();
  }
}

export type ActionLike =
  | Action
  | CreateAction
  | EditAction
  | ViewAction
  | DeleteAction;

export function resolveActions(actions: ActionLike[]): ActionConfig[] {
  return actions.map((action) => action.build());
}

/** Collect `.handle()` callbacks from Action builders (by action name). */
export function resolveBulkHandlers(
  actions: ActionLike[],
): Record<string, BulkActionHandler> {
  const handlers: Record<string, BulkActionHandler> = {};
  for (const action of actions) {
    if (action instanceof Action) {
      const handler = action.getHandler();
      if (handler) {
        handlers[action.build().name] = handler;
      }
    }
  }
  return handlers;
}

/** Built-in CSV/JSON export header action for the resource list. */
export function exportAction(): Action {
  return Action.make('export')
    .label('Export')
    .header()
    .link()
    .url('__loom_export__')
    .method('GET')
    .ability('export');
}

/** Built-in CSV import header action (opens import dialog). */
export function importAction(): Action {
  return Action.make('import')
    .label('Import')
    .header()
    .link()
    .url('__loom_import__')
    .method('GET')
    .ability('import');
}

/** Built-in bulk delete action for the list selection bar (auto-added when omitted). */
export function bulkDeleteAction(): Action {
  return Action.make('delete')
    .label('Delete selected')
    .bulk()
    .color('danger')
    .confirm('Delete selected records?')
    .method('POST')
    .url('__loom_bulk_delete__')
    .ability('delete');
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
