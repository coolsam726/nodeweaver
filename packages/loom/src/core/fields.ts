import type { ColumnConfig, FieldConfig, FieldType } from './types.js';

abstract class Configurable<T> {
  protected config: T;

  protected constructor(config: T) {
    this.config = config;
  }

  build(): T {
    return { ...this.config };
  }
}

abstract class FieldBase<T extends FieldConfig> extends Configurable<T> {
  label(value: string): this {
    this.config.label = value;
    return this;
  }

  required(value = true): this {
    this.config.required = value;
    return this;
  }

  searchable(value = true): this {
    this.config.searchable = value;
    return this;
  }

  placeholder(value: string): this {
    this.config.placeholder = value;
    return this;
  }

  help(value: string): this {
    this.config.help = value;
    return this;
  }

  hiddenOnForm(value = true): this {
    this.config.hiddenOnForm = value;
    return this;
  }

  hiddenOnTable(value = true): this {
    this.config.hiddenOnTable = value;
    return this;
  }

  hiddenOnDetail(value = true): this {
    this.config.hiddenOnDetail = value;
    return this;
  }

  readonly(value = true): this {
    this.config.readonly = value;
    return this;
  }

  createOnly(value = true): this {
    this.config.createOnly = value;
    return this;
  }
}

function baseField(name: string, type: FieldType): FieldConfig {
  return { name, type, label: humanize(name) };
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

export class TextField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): TextField {
    return new TextField(baseField(name, 'text'));
  }

  maxLength(value: number): this {
    this.config.maxLength = value;
    return this;
  }
}

export class TextareaField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): TextareaField {
    return new TextareaField(baseField(name, 'textarea'));
  }
}

export class NumberField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): NumberField {
    return new NumberField(baseField(name, 'number'));
  }
}

export class BooleanField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): BooleanField {
    return new BooleanField(baseField(name, 'boolean'));
  }
}

export class DateField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): DateField {
    return new DateField(baseField(name, 'date'));
  }
}

export class DateTimeField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): DateTimeField {
    return new DateTimeField(baseField(name, 'datetime'));
  }
}

export class SelectField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): SelectField {
    return new SelectField(baseField(name, 'select'));
  }

  options(value: Array<{ label: string; value: string | number }>): this {
    this.config.options = value;
    return this;
  }
}

export class RelationField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): RelationField {
    return new RelationField(baseField(name, 'relation'));
  }

  to(resource: string, labelField: string): this {
    this.config.relation = { resource, labelField };
    return this;
  }
}

export class EmailField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): EmailField {
    return new EmailField(baseField(name, 'email'));
  }
}

export class PasswordField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): PasswordField {
    const field = new PasswordField(baseField(name, 'password'));
    field.config.createOnly = true;
    field.config.hiddenOnTable = true;
    field.config.hiddenOnDetail = true;
    return field;
  }
}

export type Field =
  | TextField
  | TextareaField
  | NumberField
  | BooleanField
  | DateField
  | DateTimeField
  | SelectField
  | RelationField
  | EmailField
  | PasswordField;

export function resolveFields(fields: Field[]): FieldConfig[] {
  return fields.map((field) => field.build());
}

abstract class ColumnBase<T extends ColumnConfig> extends Configurable<T> {
  label(value: string): this {
    this.config.label = value;
    return this;
  }

  searchable(value = true): this {
    this.config.searchable = value;
    return this;
  }

  sortable(value = true): this {
    this.config.sortable = value;
    return this;
  }
}

function baseColumn(name: string, type: ColumnConfig['type']): ColumnConfig {
  return { name, type, label: humanize(name) };
}

export class IdColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name = 'id'): IdColumn {
    return new IdColumn(baseColumn(name, 'id'));
  }
}

export class TextColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name: string): TextColumn {
    return new TextColumn(baseColumn(name, 'text'));
  }
}

export class BooleanColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name: string): BooleanColumn {
    const col = new BooleanColumn(baseColumn(name, 'boolean'));
    col.config.format = 'boolean';
    return col;
  }
}

export class DateColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name: string): DateColumn {
    const col = new DateColumn(baseColumn(name, 'date'));
    col.config.format = 'date';
    return col;
  }
}

export class DateTimeColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name: string): DateTimeColumn {
    const col = new DateTimeColumn(baseColumn(name, 'datetime'));
    col.config.format = 'datetime';
    return col;
  }
}

export type Column =
  | IdColumn
  | TextColumn
  | BooleanColumn
  | DateColumn
  | DateTimeColumn;

export function resolveColumns(columns: Column[]): ColumnConfig[] {
  return columns.map((column) => column.build());
}
