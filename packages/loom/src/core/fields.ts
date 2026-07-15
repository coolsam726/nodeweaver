import type { ColumnConfig, ColumnSpan, FieldConfig, FieldType } from './types.js';
import { warnLoomDeprecated } from './deprecation.js';

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

  disabled(value = true): this {
    this.config.disabled = value;
    return this;
  }

  default(value: unknown): this {
    this.config.default = value;
    return this;
  }

  prefix(value: string): this {
    this.config.prefix = value;
    return this;
  }

  suffix(value: string): this {
    this.config.suffix = value;
    return this;
  }

  autofocus(value = true): this {
    this.config.autofocus = value;
    return this;
  }

  columnSpan(value: number | 'full'): this {
    this.config.columnSpan = value;
    return this;
  }

  columnSpanFull(): this {
    this.config.columnSpan = 'full';
    return this;
  }

  columnStart(value: number): this {
    this.config.columnStart = value;
    return this;
  }

  hint(value: string): this {
    return this.help(value);
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

  rows(value: number): this {
    this.config.rows = value;
    return this;
  }
}

export class NumberField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): NumberField {
    return new NumberField(baseField(name, 'number'));
  }

  min(value: number): this {
    this.config.min = value;
    return this;
  }

  max(value: number): this {
    this.config.max = value;
    return this;
  }

  step(value: number): this {
    this.config.step = value;
    return this;
  }
}

export class BooleanField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): BooleanField {
    return new BooleanField(baseField(name, 'boolean'));
  }

  inline(value = true): this {
    this.config.inline = value;
    return this;
  }

  trueLabel(value: string): this {
    this.config.trueLabel = value;
    return this;
  }

  falseLabel(value: string): this {
    this.config.falseLabel = value;
    return this;
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

  /**
   * Many-to-one: store foreign key, pick one related record.
   * `labelField` is the related attribute to show (default `displayName`).
   */
  manyToOne(resource: string, labelField = 'displayName'): this {
    this.config.relation = {
      kind: 'many2one',
      resource,
      labelField,
      foreignKey: this.config.name,
    };
    return this;
  }

  /**
   * Many-to-many: store related id array on this field; default widget is chips combobox.
   */
  manyToMany(resource: string, labelField = 'displayName'): this {
    this.config.relation = {
      kind: 'many2many',
      resource,
      labelField,
      foreignKey: this.config.name,
      widget: this.config.relation?.widget ?? 'combobox',
    };
    return this;
  }

  /**
   * One-to-many (chips / checkboxes / table): stores related id array on this field.
   */
  oneToMany(resource: string, labelField = 'displayName'): this {
    this.config.relation = {
      kind: 'one2many',
      resource,
      labelField,
      foreignKey: this.config.name,
      widget: this.config.relation?.widget ?? 'combobox',
    };
    return this;
  }

  /**
   * Choose multi-relation form widget: `combobox` (chips), `checkboxList`, or `relationTable`.
   */
  widget(value: 'combobox' | 'checkboxList' | 'relationTable'): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        widget: value,
      };
      return this;
    }
    this.config.relation.widget = value;
    return this;
  }

  /** Columns for `checkboxList` (1–4). With `groupBy`, columns of group clusters. */
  checkboxColumns(value: 1 | 2 | 3 | 4): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        widget: 'checkboxList',
        checkboxColumns: value,
      };
      return this;
    }
    this.config.relation.checkboxColumns = value;
    return this;
  }

  /**
   * When selecting `*` or `resource:*`, disable more specific options (default: on for checkboxList).
   */
  cascadeWildcards(value = true): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        cascadeWildcards: value,
      };
      return this;
    }
    this.config.relation.cascadeWildcards = value;
    return this;
  }

  /** Group checkboxList options by a related-record field (e.g. `resource`). */
  groupBy(field: string): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        widget: 'checkboxList',
        groupBy: field,
      };
      return this;
    }
    this.config.relation.groupBy = field;
    return this;
  }

  /**
   * Wrap checkboxList in a bordered fixed-height scroll box (default true).
   * Pass `false` for an open layout (e.g. permission clusters).
   */
  checkboxFramed(value = true): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        widget: 'checkboxList',
        checkboxFramed: value,
      };
      return this;
    }
    this.config.relation.checkboxFramed = value;
    return this;
  }

  /** @deprecated Use `manyToOne` */
  to(resource: string, labelField: string): this {
    warnLoomDeprecated(
      'RelationField.to',
      'RelationField.to() is deprecated; use manyToOne() instead.',
    );
    return this.manyToOne(resource, labelField);
  }
}

export class FileField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): FileField {
    return new FileField(baseField(name, 'file'));
  }

  accept(value: string[]): this {
    this.config.media = { ...this.config.media, accept: value };
    return this;
  }

  maxBytes(value: number): this {
    this.config.media = { ...this.config.media, maxBytes: value };
    return this;
  }

  disk(value: string): this {
    this.config.media = { ...this.config.media, disk: value };
    return this;
  }
}

export class ImageField extends FieldBase<FieldConfig> {
  private constructor(config: FieldConfig) {
    super(config);
  }

  static make(name: string): ImageField {
    return new ImageField(baseField(name, 'image'));
  }

  accept(value: string[]): this {
    this.config.media = { ...this.config.media, accept: value };
    return this;
  }

  maxBytes(value: number): this {
    this.config.media = { ...this.config.media, maxBytes: value };
    return this;
  }

  disk(value: string): this {
    this.config.media = { ...this.config.media, disk: value };
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
  | PasswordField
  | FileField
  | ImageField;

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

  columnSpan(value: number | 'full'): this {
    this.config.columnSpan = value;
    return this;
  }

  columnSpanFull(): this {
    this.config.columnSpan = 'full';
    return this;
  }

  columnStart(value: number): this {
    this.config.columnStart = value;
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

export class ImageColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  static make(name: string): ImageColumn {
    return new ImageColumn(baseColumn(name, 'image'));
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

export class RelationColumn extends ColumnBase<ColumnConfig> {
  private constructor(config: ColumnConfig) {
    super(config);
  }

  /**
   * Create a relation column.
   * - `RelationColumn.make('companyId').manyToOne('companies', 'name')`
   * - `RelationColumn.make('company.email').manyToOne('companies')` — FK `companyId`, display `email`
   */
  static make(name: string): RelationColumn {
    const col = new RelationColumn(baseColumn(name, 'relation'));
    const dotted = parseRelationDisplayName(name);
    if (dotted) {
      col.config.label = humanize(dotted.relationKey);
      col.config.relation = {
        kind: 'many2one',
        resource: '',
        labelField: dotted.displayField,
        foreignKey: dotted.foreignKey,
      };
    }
    return col;
  }

  manyToOne(resource: string, labelField?: string): this {
    const existing = this.config.relation;
    const dotted = parseRelationDisplayName(this.config.name);
    this.config.relation = {
      kind: 'many2one',
      resource,
      labelField: labelField ?? existing?.labelField ?? dotted?.displayField ?? 'displayName',
      foreignKey: existing?.foreignKey ?? dotted?.foreignKey ?? this.config.name,
    };
    return this;
  }

  manyToMany(resource: string, labelField = 'displayName'): this {
    this.config.relation = {
      kind: 'many2many',
      resource,
      labelField,
      foreignKey: this.config.name,
      widget: this.config.relation?.widget ?? 'combobox',
    };
    return this;
  }

  oneToMany(resource: string, labelField = 'displayName'): this {
    this.config.relation = {
      kind: 'one2many',
      resource,
      labelField,
      foreignKey: this.config.name,
      widget: this.config.relation?.widget ?? 'combobox',
    };
    return this;
  }

  widget(value: 'combobox' | 'checkboxList' | 'relationTable'): this {
    if (!this.config.relation) {
      this.config.relation = {
        kind: 'many2many',
        resource: '',
        labelField: 'displayName',
        foreignKey: this.config.name,
        widget: value,
      };
      return this;
    }
    this.config.relation.widget = value;
    return this;
  }
}

/** `company.email` → relationKey company, FK companyId, display email */
export function parseRelationDisplayName(name: string): {
  relationKey: string;
  displayField: string;
  foreignKey: string;
} | null {
  if (!name.includes('.')) return null;
  const [relationKey, ...rest] = name.split('.');
  if (!relationKey || rest.length === 0) return null;
  return {
    relationKey,
    displayField: rest.join('.'),
    foreignKey: `${relationKey}Id`,
  };
}

export type Column =
  | IdColumn
  | TextColumn
  | BooleanColumn
  | ImageColumn
  | DateColumn
  | DateTimeColumn
  | RelationColumn;

export function resolveColumns(columns: Column[]): ColumnConfig[] {
  return columns.map((column) => column.build());
}
