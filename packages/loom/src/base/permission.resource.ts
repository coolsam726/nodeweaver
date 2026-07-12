import {
  IdColumn,
  Resource,
  Schema,
  Table,
  TextColumn,
  TextField,
  InfolistBuilder,
  type LoomAuthUser,
} from '../core/index.js';

/**
 * Synced permission catalog — view/assign via roles; create/edit/delete disabled (synced from resources).
 * List/view access follows `permissions:viewAny` / `permissions:view`.
 */
export abstract class PermissionResourceBase extends Resource {
  static override slug = 'permissions';
  static override label = 'Permissions';
  static override singularLabel = 'Permission';
  static override icon = 'key';
  static override navigationGroup = 'Administration';
  static override navigationSection = 'Users & access';
  static override recordTitleField = 'name';

  static override canCreate(_user: LoomAuthUser): boolean {
    return false;
  }
  static override canEdit(_user: LoomAuthUser, _record?: Record<string, unknown>): boolean {
    return false;
  }
  static override canDelete(_user: LoomAuthUser, _record?: Record<string, unknown>): boolean {
    return false;
  }

  static override headerActions() {
    return [];
  }

  static override presentation() {
    return { form: 'modal' as const, detail: 'modal' as const };
  }

  static override form(schema: Schema) {
    schema
      .section('permission', 'Permission')
      .columns(2)
      .fields(
        TextField.make('name').required().searchable().readonly(),
        TextField.make('resource').readonly(),
        TextField.make('ability').readonly(),
        TextField.make('label').readonly(),
      );
    return schema.build();
  }

  static override table(table: Table) {
    return table
      .columns(
        IdColumn.make(),
        TextColumn.make('name').searchable().sortable(),
        TextColumn.make('resource').searchable().sortable(),
        TextColumn.make('ability').sortable(),
        TextColumn.make('label'),
      )
      .defaultSort('name', 'asc')
      .build();
  }

  static override detail(infolist: InfolistBuilder) {
    return infolist
      .section('permission', 'Permission')
      .entries(
        TextColumn.make('name'),
        TextColumn.make('resource'),
        TextColumn.make('ability'),
        TextColumn.make('label'),
      )
      .build();
  }
}
