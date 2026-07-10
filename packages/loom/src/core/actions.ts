export type ActionColor = 'primary' | 'accent' | 'danger' | 'gray';
export type ActionStyle = 'button' | 'link' | 'icon';

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

  build(): T {
    return { ...this.config };
  }
}

export class Action extends ActionBase<ActionConfig> {
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

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
