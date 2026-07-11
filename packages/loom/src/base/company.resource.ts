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
 * Extendable base resource for companies.
 * Override `form`, `table`, or `detail` in a subclass to add app-specific fields.
 */
export abstract class CompanyResourceBase extends Resource {
  static override slug = 'companies';
  static override label = 'Companies';
  static override singularLabel = 'Company';
  static override icon = 'building';
  static override navigationGroup = 'Administration';
  static override navigationSection = 'Organization';
  static override recordTitleField = 'name';

  static override presentation() {
    return { form: 'modal' as const, detail: 'modal' as const };
  }

  static override form(schema: Schema): import('../core/schema.js').FormSchema {
    schema
      .section('identity', 'Identity', 'Core company information')
      .columns(2)
      .fields(
        TextField.make('name').required().searchable(),
        TextField.make('code').searchable().placeholder('ACME'),
        EmailField.make('email'),
        TextField.make('phone'),
        BooleanField.make('active').label('Active').inline(),
      );
    return schema.build();
  }

  static override table(table: Table): ReturnType<Table['build']> {
    return table
      .columns(
        IdColumn.make(),
        TextColumn.make('name').searchable().sortable(),
        TextColumn.make('code').searchable().sortable(),
        BooleanColumn.make('active').sortable(),
        DateTimeColumn.make('createdAt').sortable(),
      )
      .defaultSort('name', 'asc')
      .build();
  }

  static override detail(infolist: InfolistBuilder) {
    return infolist
      .section('identity', 'Identity')
      .entries(
        TextColumn.make('name'),
        TextColumn.make('code'),
        TextColumn.make('email'),
        TextColumn.make('phone'),
        BooleanColumn.make('active'),
        DateTimeColumn.make('createdAt'),
      )
      .build();
  }

  static override kanban(kanban: KanbanBuilder) {
    return kanban
      .title('Companies')
      .gridColumns(4)
      .card('name', 'email')
      .fields('code', 'phone')
      .build();
  }
}
