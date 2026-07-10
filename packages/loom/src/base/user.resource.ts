import {
  BooleanColumn,
  BooleanField,
  DateTimeColumn,
  EmailField,
  IdColumn,
  PasswordField,
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
 * Override schemas in a subclass to add roles, permissions, etc.
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
        RelationField.make('companyId').to('companies', 'name').label('Company'),
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
        TextColumn.make('companyId').label('Company'),
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
        TextColumn.make('companyId').label('Company'),
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
