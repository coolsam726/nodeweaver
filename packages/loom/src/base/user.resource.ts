import {
  BooleanColumn,
  BooleanField,
  DateTimeColumn,
  EmailField,
  IdColumn,
  PasswordField,
  RelationColumn,
  RelationField,
  Resource,
  KanbanBuilder,
  Schema,
  Table,
  TextColumn,
  TextField,
  InfolistBuilder,
} from '../core/index.js';

/**
 * Extendable base resource for users.
 * Assign roles via `roleIds` (many-to-many chips select).
 * Access follows RBAC permissions (`users:viewAny`, etc.).
 */
export abstract class UserResourceBase extends Resource {
  static override slug = 'users';
  static override label = 'Users';
  static override singularLabel = 'User';
  static override icon = 'users';
  static override navigationGroup = 'Administration';
  static override navigationSection = 'Users & access';
  static override recordTitleField = 'name';

  static override presentation() {
    return { form: 'modal' as const, detail: 'modal' as const };
  }

  static override form(schema: Schema): import('../core/schema.js').FormSchema {
    schema
      .section('profile', 'Profile')
      .columns(2)
      .fields(
        TextField.make('name').required().searchable(),
        EmailField.make('email').required().searchable(),
        PasswordField.make('password').required().label('Password'),
        RelationField.make('roleIds').manyToMany('roles').widget('relationTable').label('Roles').columnSpanFull(),
        RelationField.make('companyIds')
          .manyToMany('companies')
          .widget('combobox')
          .label('Companies')
          .columnSpanFull(),
        RelationField.make('companyId').manyToOne('companies').label('Default company'),
        BooleanField.make('active').label('Active'),
      );
    return schema.build();
  }

  static override table(table: Table): ReturnType<Table['build']> {
    return table
      .columns(
        IdColumn.make(),
        TextColumn.make('name').searchable().sortable(),
        TextColumn.make('email').searchable().sortable(),
        RelationColumn.make('roleIds').manyToMany('roles').label('Roles'),
        RelationColumn.make('companyIds').manyToMany('companies').label('Companies'),
        RelationColumn.make('company.displayName').manyToOne('companies').label('Default company'),
        BooleanColumn.make('active').sortable(),
        DateTimeColumn.make('createdAt').sortable(),
      )
      .defaultSort('createdAt', 'desc')
      .build();
  }

  static override detail(infolist: InfolistBuilder) {
    return infolist
      .section('profile', 'Profile')
      .entries(
        TextColumn.make('name'),
        TextColumn.make('email'),
        RelationColumn.make('roleIds').manyToMany('roles').label('Roles'),
        RelationColumn.make('companyIds').manyToMany('companies').label('Companies'),
        RelationColumn.make('company.displayName').manyToOne('companies').label('Default company'),
        BooleanColumn.make('active'),
        DateTimeColumn.make('createdAt'),
      )
      .build();
  }

  static override kanban(kanban: KanbanBuilder) {
    return kanban
      .title('Users')
      .gridColumns(4)
      .card('name', 'email')
      .fields('companyId')
      .build();
  }
}
