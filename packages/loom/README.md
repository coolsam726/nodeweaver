# @nestweaver/loom

**Declarative admin panel for NestJS** — part of the [nestweaver](https://github.com/coolsam726/nuxest) ecosystem.

Loom weaves your models into a full CRUD UI at `/admin`: Filament-style resources, list and kanban views, modals, toasts, and ORM adapters for TypeORM, Prisma, Drizzle, and Mongoose.

**Theme defaults:** primary `#286291`, accent `#F1511B`, page background `#FEE9E2` (accent-100).

## Install

```bash
pnpm add @nestweaver/loom handlebars
```

Install your ORM peer as needed (`typeorm`, `@prisma/client`, `drizzle-orm`, or `mongoose`).

## Quick start

```typescript
import { Module } from '@nestjs/common';
import { LoomModule } from '@nestweaver/loom';
import { CompanyResourceBase } from '@nestweaver/loom/base';
import { Company } from './database/company.entity.js';

export class CompanyResource extends CompanyResourceBase {
  static override model = Company;
}

@Module({
  imports: [
    LoomModule.forRoot({
      orm: 'typeorm',
      dataSource: appDataSource,
      resources: [CompanyResource],
      basePath: '/admin',
      title: 'My App Admin',
    }),
  ],
})
export class AppModule {}
```

Visit `/admin` for the dashboard, `/admin/companies` for the resource list.

## Filament-style API

### Schemas (forms)

Use `Schema` with sections — mirrors Filament form schemas:

```typescript
static override form(schema: Schema) {
  return schema
    .section('identity', 'Identity', 'Core details')
    .columns(2)
    .fields(
      TextField.make('name').required(),
      EmailField.make('email').required(),
      PasswordField.make('password').required(),
    )
    .build();
}
```

### Tables (lists)

Use `Table` for list columns, search, and default sort:

```typescript
static override table(table: Table) {
  return table
    .columns(TextColumn.make('name').searchable().sortable())
    .defaultSort('name', 'asc')
    .build();
}
```

### Detail (infolist)

Optional `detail()` defines a read-only infolist. When omitted, the detail route renders a **readonly form** built from the form schema.

### Kanban

Optional `kanban()` defines columns and card fields for a board view at `/admin/:resource?view=kanban`.

### Presentation

Resources support `presentation: { form: 'modal' | 'page', detail: 'modal' | 'page' }` for PyVelm-style dialogs or full-page routes.

## Base resources

Extendable **Companies** and **Users** ship in `@nestweaver/loom/base`:

```typescript
import { CompanyResourceBase } from '@nestweaver/loom/base';

export class CompanyResource extends CompanyResourceBase {
  static override model = Company;
}
```

## ORM adapters

Loom picks an adapter from `orm` + `dataSource`, or you can pass a custom `adapter`.

| `orm` | `dataSource` |
|-------|----------------|
| `typeorm` | TypeORM `DataSource` |
| `prisma` | Prisma client / `PrismaService` |
| `drizzle` | `{ db, schema }` |
| `mongoose` | Mongoose `Connection` |

## Branding

Set env vars or pass `branding` in `LoomModule.forRoot()`:

| Env var | Purpose |
|---------|---------|
| `LOOM_BRAND_NAME` | Panel title (also `VELM_BRAND_NAME`) |
| `LOOM_BRAND_LOGO_URL` | Logo (light mode) |
| `LOOM_BRAND_PRIMARY_COLOR` | Primary hex color |
| `LOOM_BRAND_ACCENT_COLOR` | Accent hex color |

Legacy `VELM_BRAND_*` env vars are still supported.

## Development

```bash
pnpm --filter @nestweaver/loom build:css
pnpm --filter @nestweaver/loom build
```

## License

MIT
