# @nestweaver/loom

**Declarative admin panel for NestJS** — part of the [nestweaver](https://github.com/coolsam726/nuxest) ecosystem.

Loom turns your models into a full CRUD admin at `/admin`: Filament-style resources, list and kanban views, modal forms, relation widgets, cookie auth, and string-based RBAC. It ships ORM adapters for **TypeORM**, **Prisma**, **Drizzle**, and **Mongoose**.

| Stack | Role |
|-------|------|
| NestJS | Module, controllers, guards |
| Handlebars | SSR views |
| Tailwind CSS + Alpine.js | UI chrome and widgets |

**Default branding:** primary `#f1511b`, accent `#286291`, brand name `Admin`.

**Package exports**

| Import | Contents |
|--------|----------|
| `@nestweaver/loom` | Resources, fields, auth helpers, adapters, branding |
| `@nestweaver/loom/base` | `CompanyResourceBase`, `UserResourceBase`, `RoleResourceBase`, `PermissionResourceBase` |
| `@nestweaver/loom/nest` | Guards, decorators, API controller factory, filters |

---

## Table of contents

1. [Install](#install)
2. [Quick start](#quick-start)
3. [Module options](#module-options)
4. [Resources](#resources)
5. [Forms, tables, detail & kanban](#forms-tables-detail--kanban)
6. [Fields & columns](#fields--columns)
7. [Relations](#relations)
8. [Actions](#actions)
9. [Authentication](#authentication)
10. [RBAC](#rbac)
11. [Policies](#policies)
12. [Admin UI](#admin-ui)
13. [JSON API](#json-api)
14. [ORM adapters & ACL stores](#orm-adapters--acl-stores)
15. [Base resources](#base-resources)
16. [Branding & shell](#branding--shell)
17. [Nestweaver scaffolding](#nestweaver-scaffolding)
18. [Development](#development)

---

## Install

```bash
pnpm add @nestweaver/loom handlebars
```

Install the ORM peer you use:

| ORM | Packages |
|-----|----------|
| TypeORM | `typeorm`, `@nestjs/typeorm` |
| Prisma | `@prisma/client` |
| Drizzle | `drizzle-orm` (+ driver) |
| Mongoose | `mongoose`, `@nestjs/mongoose` |

Also ensure `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are present (Nest peers).

---

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
      branding: { brandName: 'My App Admin' },
      auth: {
        secret: process.env.LOOM_AUTH_SECRET!,
        seedAdmin: {
          email: 'admin@example.com',
          password: 'password',
          name: 'Admin',
        },
      },
    }),
  ],
})
export class AppModule {}
```

- Panel: `/admin`
- Resource list: `/admin/companies`
- Login: `/admin/login` (when `auth.secret` is set)

### Async registration

```typescript
LoomModule.forRootAsync({
  inject: [DataSource],
  useFactory: (dataSource: DataSource) => ({
    orm: 'typeorm',
    dataSource,
    resources: [CompanyResource, UserResource, RoleResource, PermissionResource],
    auth: {
      secret: process.env.LOOM_AUTH_SECRET!,
      secure: process.env.NODE_ENV === 'production',
      seedAdmin: {
        email: process.env.LOOM_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.LOOM_ADMIN_PASSWORD || 'password',
        name: process.env.LOOM_ADMIN_NAME || 'Admin',
        role: 'admin',
      },
    },
  }),
})
```

Inject tokens by ORM:

| ORM | `inject` | `dataSource` |
|-----|----------|--------------|
| TypeORM | `DataSource` | the `DataSource` instance |
| Prisma | `PrismaService` | the Prisma client |
| Drizzle | `DRIZZLE` | `{ db, schema }` |
| Mongoose | `getConnectionToken()` | Mongoose `Connection` |

---

## Module options

`LoomModuleOptions`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `basePath` | `string` | `'/admin'` | Admin URL prefix |
| `branding` | `Partial<LoomBranding>` | defaults + env | Panel name, colors, logos, fonts |
| `title` | `string` | — | **Deprecated** — use `branding.brandName` |
| `orm` | `'typeorm' \| 'prisma' \| 'drizzle' \| 'mongoose'` | — | Selects adapter + ACL store |
| `dataSource` | ORM-specific | — | See [ORM adapters](#orm-adapters--acl-stores) |
| `adapter` | `LoomAdapter` | auto | Custom adapter (skips ORM factory) |
| `resources` | `ResourceClass[]` | `[]` | Registered resources |
| `auth` | `LoomAuthOptions` | — | Cookie sessions + RBAC when `secret` is set |
| `allowAnonymousAdmin` | `boolean` | `false` | Opt out of production fail-closed (not recommended) |
| `api` | `boolean \| { enabled?, prefix? }` | enabled | JSON API at `/api/loom` |
| `observability` | `{ onError?, slowQueryMs? }` | — | Request IDs always set; optional error / slow-query hooks |
| `locale` / `messages` | `en` / overrides | — | Admin string catalog (`t('auth.signIn')`) |
| `companies` | `LoomCompany[]` | — | Branding overrides (merged by id when tenancy loads live companies) |
| `currentCompanyId` | `string` | — | Fallback company id when the session has none |
| `auth.tenancy` | `false \| LoomTenancyConfig` | off | Session company, topbar switcher, and `companyScoped` filtering |
| `user` | `{ name, email?, avatar?, role? }` | — | Shell profile when auth is off |

Adapter resolution order: custom `adapter` → noop (no resources) → `createLoomAdapter(orm, dataSource)`.

---

## Resources

Every admin screen is a `Resource` subclass (or one built with `defineResource` / `extendResource`).

### Static members

| Member | Purpose |
|--------|---------|
| `slug` | URL segment and permission prefix (`companies`) |
| `label` / `singularLabel` | Nav and headings |
| `model` | ORM entity class, Prisma model name string, or Drizzle table key |
| `icon` | Sidebar icon key |
| `navigationGroup` | Primary nav group (default `General`) |
| `navigationSection` | Secondary topbar section |
| `recordTitleField` | Field used for titles (default `name`) |
| `companyScoped` / `companyField` | Opt into tenancy scoping when `auth.tenancy` is on |
| `policy` | Optional [Policy](#policies) class |
| `form` / `table` / `detail` / `kanban` | Schemas |
| `headerActions` / `recordActions` | Toolbar / row actions |
| `presentation` | `{ form?, detail? }` → `'page' \| 'modal'` |
| `permissions` | Extra abilities to seed (see [RBAC](#rbac)) |
| `canAccess` / `canViewAny` / `canView` / `canCreate` / `canEdit` / `canDelete` | Ability hooks |

### Defining a resource

```typescript
import {
  Resource,
  Schema,
  Table,
  TextField,
  TextColumn,
  BooleanField,
  BooleanColumn,
} from '@nestweaver/loom';

export class TagResource extends Resource {
  static override slug = 'tags';
  static override label = 'Tags';
  static override singularLabel = 'Tag';
  static override model = 'Tag'; // Prisma / string model
  static override navigationGroup = 'CRM';
  static override icon = 'tag';

  static override form(schema: Schema) {
    return schema
      .section('tag', 'Tag')
      .columns(2)
      .fields(
        TextField.make('name').required().searchable(),
        BooleanField.make('active').default(true),
      )
      .build();
  }

  static override table(table: Table) {
    return table
      .columns(
        TextColumn.make('name').searchable().sortable(),
        BooleanColumn.make('active').sortable(),
      )
      .defaultSort('name', 'asc')
      .build();
  }

  static override presentation() {
    return { form: 'modal' as const, detail: 'modal' as const };
  }
}
```

### Config helpers

```typescript
import { defineResource, extendResource } from '@nestweaver/loom';

const TagResource = defineResource({
  slug: 'tags',
  label: 'Tags',
  singularLabel: 'Tag',
  model: 'Tag',
  form: (schema) => {
    schema.fields(TextField.make('name').required());
  },
  table: (table) => {
    table.columns(TextColumn.make('name').searchable());
  },
});

export class CompanyResource extends extendResource(CompanyResourceBase, {
  navigationGroup: 'CRM',
}) {}
```

### Navigation

- Items are grouped by `navigationGroup` (built-in icons for Administration, General, CRM, Settings).
- `navigationSection` nests items under a secondary topbar menu.
- With auth enabled, items are filtered by `canAccess` / `canViewAny`.

### Presentation

```typescript
static override presentation() {
  return { form: 'modal', detail: 'modal' }; // or 'page'
}
```

- `modal` — opens create/edit/view in a Loom dialog (supports nested related-record dialogs).
- `page` — full-page routes.

---

## Forms, tables, detail & kanban

### Forms (`Schema`)

```typescript
static override form(schema: Schema) {
  return schema
    .section('identity', 'Identity', 'Core details')
    .columns(2) // 1 | 2 | 3 | 4
    .fields(
      TextField.make('name').required().columnSpanFull(),
      EmailField.make('email').required(),
    )
    .build();
}
```

Section methods: `.section(name, title, description?)`, `.columns(n)`, `.fields(...)`, `.field(...)`.

Default form layout is **2 columns** when not overridden.

### Tables (`Table`)

```typescript
static override table(table: Table) {
  return table
    .columns(
      IdColumn.make(),
      TextColumn.make('name').searchable().sortable(),
    )
    .defaultSort('createdAt', 'desc')
    .build();
}
```

### Detail (`Infolist`)

```typescript
static override detail(infolist: InfolistBuilder) {
  return infolist
    .section('overview', 'Overview')
    .entries(
      TextColumn.make('name'),
      BooleanColumn.make('active'),
    )
    .build();
}
```

If `detail()` is omitted, the detail route renders a **readonly form** built from the form schema.

### Kanban

```typescript
static override kanban(kanban: KanbanBuilder) {
  return kanban
    .title('Pipeline')
    .groupBy('stage')
    .sequence(['lead', 'qualified', 'won', 'lost'])
    .card('name', 'amount')
    .fields(TextField.make('name'))
    .badges(TextColumn.make('stage'))
    .gridColumns(4)
    .build();
}
```

Board URL: **`/admin/:resource/kanban`** (not a query string).

---

## Fields & columns

### Field types

| Class | Type | Notes |
|-------|------|-------|
| `TextField` | `text` | `.maxLength(n)` |
| `TextareaField` | `textarea` | `.rows(n)` |
| `NumberField` | `number` | `.min()`, `.max()`, `.step()` |
| `BooleanField` | `boolean` | `.inline()`, `.trueLabel()`, `.falseLabel()` |
| `DateField` | `date` | |
| `DateTimeField` | `datetime` | |
| `SelectField` | `select` | `.options([{ label, value }])` |
| `EmailField` | `email` | |
| `PasswordField` | `password` | Create-only by default; hidden on table/detail; hashed on save |
| `RelationField` | `relation` | See [Relations](#relations) |

### Shared field methods

`label`, `required`, `searchable`, `placeholder`, `help` / `hint`, `hiddenOnForm` / `hiddenOnTable` / `hiddenOnDetail`, `readonly`, `disabled`, `default`, `prefix`, `suffix`, `autofocus`, `columnSpan(n)` / `columnSpanFull()`, `columnStart(n)`, `createOnly`.

### Columns

| Class | Notes |
|-------|-------|
| `IdColumn` | Primary key |
| `TextColumn` | |
| `BooleanColumn` | Boolean formatting |
| `DateColumn` / `DateTimeColumn` | |
| `RelationColumn` | Displays related label(s) |

Shared: `label`, `searchable`, `sortable`, `columnSpan` / `columnSpanFull`, `columnStart`.

`RelationColumn.make('company.email').manyToOne('companies')` — dotted names resolve FK `companyId` and display field `email`.

---

## Relations

### Kinds

| Kind | Method | Storage |
|------|--------|---------|
| Many-to-one | `.manyToOne(resource, labelField?)` | Single FK (e.g. `companyId`) |
| Many-to-many | `.manyToMany(resource, labelField?)` | Id array / JSON / text list (e.g. `roleIds`) |
| One-to-many | `.oneToMany(resource, labelField?)` | Inverse collection (UI / summary) |

Deprecated alias: `.to()` → `.manyToOne()`.

### Widgets

| Widget | Use |
|--------|-----|
| `combobox` (default) | Searchable chips / single select, quick-create, open related modal |
| `checkboxList` | Grouped checkboxes (ideal for permissions) |
| `relationTable` | Table picker (ideal for assigning roles) |

### Checkbox list options

```typescript
RelationField.make('permissionIds')
  .manyToMany('permissions', 'name')
  .widget('checkboxList')
  .checkboxColumns(4)      // grid of groups
  .groupBy('resource')     // cluster by field
  .cascadeWildcards()      // selecting `resource:*` / `*` disables covered children
  .checkboxFramed(false)   // bordered group cards off
  .label('Permissions')
  .columnSpanFull()
```

### Examples

```typescript
// User → company (M2O)
RelationField.make('companyId').manyToOne('companies', 'name')

// User → roles (M2M table)
RelationField.make('roleIds').manyToMany('roles').widget('relationTable')

// Role → permissions (M2M checkboxes)
RelationField.make('permissionIds')
  .manyToMany('permissions', 'name')
  .widget('checkboxList')
  .checkboxColumns(4)
  .groupBy('resource')
  .cascadeWildcards()
```

### Relation endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/:resource/relation-search?field&q&limit` | Combobox search JSON |
| `POST` | `/:resource/relation-quick-create` | `{ field, name }` quick-create |
| `GET` | `/:resource/:id/summary` | Short label JSON |

Quick-create is blocked when the related resource has other required fields (`RelationQuickCreateBlockedError`).

Id lists stored as JSON text (Drizzle) or comma/simple-array are normalized via `relationIdsFromValue()` when reading.

---

## Actions

Built-ins: `CreateAction`, `ViewAction`, `EditAction`, `DeleteAction`.

```typescript
static override headerActions() {
  return [
    CreateAction.make(),
    // Custom header links are supported; built-in export/bulk UIs are not shipped yet.
    Action.make('export')
      .label('Export')
      .color('gray')
      .header()
      .url('/admin/deals/export'), // your own route
  ];
}
```

Modifiers: `label`, `color('primary'|'accent'|'danger'|'gray')`, `icon`, `url`, `confirm`, `header()` / `row()` / `bulk()`, `link()`.

`bulk()` marks placement only — **there is no bulk-selection UI yet** (roadmap).

List actions are gated by the current user’s abilities (`@root.abilities` in templates).

### Not available yet

| Feature | Status |
|---------|--------|
| File / media fields | Not implemented |
| Soft deletes / restore | Not implemented |
| Audit log | Not implemented |
| Bulk action bar | Action API only |
| CSRF tokens / session revocation | Shipped (cookie double-submit + session version) |
| Interactive company/tenant switcher | Enable with `auth.tenancy` + `companyScoped` resources |
---

## Authentication

Auth is enabled when `auth.secret` is set.

### `LoomAuthOptions`

| Key | Default | Description |
|-----|---------|-------------|
| `secret` | — | HMAC session secret (**required** to enable auth) |
| `cookieName` | `loom_session` | Session cookie name |
| `maxAgeMs` | 7 days | Cookie lifetime |
| `secure` | `NODE_ENV === 'production'` | Secure cookie flag |
| `userResource` | `users` | Resource slug for the user model |
| `emailField` | `email` | |
| `passwordField` | `password` | |
| `nameField` | `name` | |
| `roleIdsField` | `roleIds` | Array / JSON list of role ids |
| `roleField` | `role` | **Deprecated** single-role field |
| `permissionsField` | `permissions` | Optional denormalized list |
| `activeField` | `active` | Inactive users cannot sign in |
| `companyIdField` | `companyId` | Shell company context |
| `seedAdmin` | — | Create admin user on boot if missing |
| `extraPermissions` | `[]` | Permissions with no Resource |
| `policies` | `{}` | API-only domain policies by slug |
| `skipRbacSync` | `false` | Skip permission/role catalog sync |
| `loginRateLimit` | `{ maxAttempts: 10, windowMs: 15m }` | Set `false` to disable |
| `allowPlaintextPasswords` | `true` in dev / `false` in prod | Legacy plaintext column verify |
| `csrf` | enabled | Double-submit cookie + `_csrf` / `X-CSRF-Token`; set `false` to disable |
| `cookiePath` | `/` | Shared path for admin + API cookies |
| `sessionVersionField` | `sessionVersion` | Bumped on logout/password change to revoke sessions |
| `passwordReset` | enabled | Forgot/reset flow; set `false` to disable. Provide `sendPasswordResetEmail` to deliver links |

**Production:** registering resources without `auth.secret` throws unless `allowAnonymousAdmin: true`.

CSRF: HTML forms include `{{> csrf}}`; JSON clients must send `X-CSRF-Token` matching the `loom_csrf` cookie (visit any admin/API GET first to receive it).

Sessions include a version (`sv`). Logout and password changes bump the version so old cookies stop working (persisted when the user model has `sessionVersion`; otherwise in-memory per process).

### Password reset

Enabled whenever auth is on (set `passwordReset: false` to hide). Users use `/admin/forgot-password` (or `POST /api/loom/forgot-password`). Tokens are single-use, hashed in memory, and expire after 1 hour by default.

```typescript
auth: {
  secret: process.env.LOOM_AUTH_SECRET!,
  passwordReset: {
    publicBaseUrl: 'https://app.example.com/admin', // optional absolute links
    sendPasswordResetEmail: async ({ to, resetUrl, user }) => {
      await mailer.send({ to, subject: 'Reset your password', text: resetUrl });
    },
  },
}
```

Without a mailer, non-production logs the reset URL; the UI always shows a generic success message (no email enumeration).

Login looks up users with an exact `findFirst` on the configured email field only (no list-scan fallback). Ensure the email column is unique/indexed.

### Observability

Every admin and JSON API response includes `X-Request-Id` (echoes inbound header or generates a UUID). Authorization failures call `observability.onError` when configured:

```typescript
observability: {
  onError: ({ error, requestId, userId, path, resource, ability }) => {
    logger.warn({ err: error, requestId, userId, path, resource, ability }, 'loom.forbidden');
  },
  slowQueryMs: 250, // warn when list / relation loads exceed this
},
```

### Soft deletes

```typescript
export class DealResource extends Resource {
  static override softDelete = true; // stamps `deletedAt`
  // or: static softDelete = { field: 'removedAt' };
}
```

List excludes trashed rows by default. Use `?trashed=1` (or Trash in the toolbar) and **Restore**. Combobox relation fields no longer preload up to 250 options (search-only); checkboxList / relationTable still preload unless `relation.preload` overrides.

### `seedAdmin`

```typescript
seedAdmin: {
  email: 'admin@example.com',
  password: 'password',
  name: 'Admin',
  role: 'admin', // role slug to assign (default admin)
}
```

### Sessions & passwords

- Cookie: HttpOnly, SameSite=Lax, Path `/`, HMAC-SHA256 payload `{ sub, exp }`.
- Passwords stored as `scrypt$N$r$p$salt$hash` via `hashPassword` / `verifyPassword`.
- Plaintext passwords are accepted once, then upgraded on successful login.
- Admin create/update also hashes password fields.

### Public paths

Login, logout, and `{basePath}/assets/*` are public. Everything else under the admin prefix requires a session when auth is enabled.

### Runtime helpers

```typescript
import { currentLoomUser, runWithLoomAuth } from '@nestweaver/loom';
```

### Nest decorators & guards

```typescript
import {
  LoomAuthGuard,
  LoomAbilityGuard,
  LoomAuthContextInterceptor,
  RequirePermission,
  LoomPublic,
} from '@nestweaver/loom/nest';

@UseInterceptors(LoomAuthContextInterceptor)
@UseGuards(LoomAbilityGuard)
@RequirePermission('orders:viewAny')
@Get('orders')
listOrders() { /* … */ }

@LoomPublic()
@Get('health')
health() {
  return { ok: true };
}
```

`@RequireLoomAbility(resource, ability)` is deprecated in favor of `@RequirePermission('resource:ability')`.

Failed admin HTML requests render an access-denied page (`LoomForbiddenExceptionFilter`); API routes return JSON 403.

---

## RBAC

Model: **users ↔ roles ↔ permissions**.

Permission names are strings: `{resource}:{ability}`.

### Built-in abilities

For every registered resource, boot sync upserts:

| Permission | Meaning |
|------------|---------|
| `{slug}:viewAny` | List / navigate |
| `{slug}:view` | View one record |
| `{slug}:create` | Create |
| `{slug}:edit` | Update |
| `{slug}:delete` | Delete |
| `{slug}:*` | All abilities on that resource |
| `*` | Superuser |

### Custom permissions on a resource

```typescript
export class DealResource extends Resource {
  static override slug = 'deals';

  static override permissions() {
    return [
      'export',                                   // → deals:export
      'publish',                                  // → deals:publish
      { name: 'approve', label: 'Approve deal' }, // → deals:approve
      'billing:refund',                           // full name, unchanged
    ];
  }
}
```

Bare ability names are prefixed with the resource `slug`. Names that already contain `:` (or `*`) pass through. Optional `label` is stored on the permission catalog row.

### Module-level extras

For domains without a Resource:

```typescript
auth: {
  secret: process.env.LOOM_AUTH_SECRET!,
  extraPermissions: ['billing:refund', 'reports:run'],
}
```

### Seeded roles

| Slug | Default permissions |
|------|---------------------|
| `admin` | `*` |
| `editor` | App resource CRUD / `{resource}:*` (excludes `users`, `roles`, `permissions`) |
| `viewer` | `viewAny` + `view` on app resources |

If `editor` / `viewer` already have permission ids, sync **keeps** them (does not overwrite custom assignments). Admin is always ensured to have `*`.

### Checks

```typescript
import { can, canAny, assertCan, userHasPermission, isAdmin } from '@nestweaver/loom';

can(user, 'deals:export');          // also honors deals:* and *
canAny(user, ['orders:edit', 'orders:*']);
userHasPermission(user, 'deals', 'viewAny');
assertCan(user, 'deals', 'edit');
isAdmin(user);                      // * or roles includes admin
```

Wildcard rules: `*` grants everything; `{resource}:*` grants all abilities on that resource; `*:{ability}` grants that ability across resources.

### User ↔ role assignment

Users store role ids in `roleIds` (configurable via `roleIdsField`). On each request Loom loads roles → permission names into `user.permissions` / `user.roles`.

---

## Policies

Record-level rules on top of string permissions.

```typescript
import { Policy, ownedBy, can } from '@nestweaver/loom';

export class OrderPolicy extends Policy {
  static ownerField = 'createdById';

  static view(user, record) {
    return can(user, 'orders:view') && ownedBy(user, record, 'createdById');
  }

  static edit(user, record) {
    return can(user, 'orders:edit') && ownedBy(user, record, 'createdById');
  }

  static scopeList(user) {
    if (can(user, '*') || can(user, 'orders:*')) return undefined;
    return { equals: { createdById: user.id } };
  }
}

export class OrderResource extends Resource {
  static override slug = 'orders';
  static override policy = OrderPolicy;
  // …
}
```

- `scopeList` is applied to list queries (`ListQuery.scope`).
- The same `scopeList` equality filters are enforced on **show / edit / delete** (and the JSON API equivalents) so knowing an ID cannot bypass list scope (IDOR guard). Return `undefined` from `scopeList` for unrestricted users (e.g. admins).
- Relation search / form option loads authorize the **related** resource `viewAny` and apply that resource's `scopeList`.
- Create can stamp `ownerField` with the current user id.
- Prefer still overriding `view` / `edit` / `delete` with `ownedBy` when you need custom record rules beyond equality filters.
- API-only domains: register via `auth.policies: { orders: OrderPolicy }`.

---

## Admin UI

### HTML routes

| Method | Path | Feature |
|--------|------|---------|
| `GET` | `/` | Dashboard |
| `GET` | `/:resource` | Table list |
| `GET` | `/:resource/kanban` | Kanban board |
| `GET` | `/:resource/create` | Create form (`?embed=1` for dialogs) |
| `POST` | `/:resource` | Create |
| `GET` | `/:resource/:id` | Detail / readonly form |
| `GET` | `/:resource/:id/edit` | Edit form |
| `POST` | `/:resource/:id` | Update |
| `POST` | `/:resource/:id/delete` | Delete |
| `GET`/`POST` | `/login`, `POST /logout` | Auth |
| `GET`/`POST` | `/forgot-password`, `/reset-password` | Password recovery |
| `GET` | `/assets/admin.css`, `loom-ui.js`, `branding.css` | Assets |

All paths are under `basePath` (default `/admin`).

### List toolbar

- Search (searchable fields)
- Rows per page: 10 / 15 / 20 / 50
- Refresh (double-click enables auto-refresh every 10s)
- Sortable columns
- Pagination
- Table ↔ kanban switcher when the resource defines `kanban()`

### Dialogs & flash

- Modal presentation uses Alpine `loomDialogHost` with a nested dialog stack for related records.
- Embed forms: `?embed=1` / `_loom_embed=1`.
- Flash toasts via `?success=created|updated|deleted` or `?error=…`.

### Shell chrome

- Sidebar + mobile drawer
- Topbar secondary sections
- Company switcher in the topbar when `auth.tenancy` is enabled (otherwise branding label only)
- User profile + logout
- Dark mode toggle (`localStorage` key `loom-theme`)
- Breadcrumbs, page heading, themed checkboxes, access-denied page

---

## JSON API

Enabled by default at **`/api/loom`**.

```typescript
api: false                          // disable
api: { prefix: 'internal/loom' }    // custom prefix (no leading slash)
api: { enabled: false }
```

### Routes

| Method | Path | Access |
|--------|------|--------|
| `POST` | `/login` | Public — sets session cookie |
| `POST` | `/logout` | Public |
| `POST` | `/forgot-password` | Public — request reset email |
| `POST` | `/reset-password` | Public — `{ token, password }` |
| `GET` | `/me` | Auth — user, roles, permissions, accessible resources |
| `GET` | `/resources` | Auth — resource discovery |
| `GET` | `/:resource` | `viewAny` (+ policy list scope) |
| `GET` | `/:resource/:id` | `view` |
| `POST` | `/:resource` | `create` |
| `PUT`/`PATCH` | `/:resource/:id` | `edit` |
| `DELETE` | `/:resource/:id` | `delete` |

List query params: `page`, `perPage` (5–100, default 15), `search`, `sort`, `direction`.

Password fields are stripped from JSON responses (`sanitizeRecord`).

Wire custom Nest controllers with the same session + ACL:

```typescript
@UseInterceptors(LoomAuthContextInterceptor)
@UseGuards(LoomAbilityGuard)
@RequirePermission('orders:viewAny')
```

---

## ORM adapters & ACL stores

### Adapters

| `orm` | `dataSource` | Model reference on resources |
|-------|--------------|------------------------------|
| `typeorm` | TypeORM `DataSource` | Entity class (`User`, `LoomRole`, …) |
| `prisma` | Prisma client | Model name string (`'User'`, `'LoomRole'`) |
| `drizzle` | `{ db, schema }` | Table export key (`'users'`, `'loomRoles'`) |
| `mongoose` | Mongoose `Connection` | Schema class, or string name for runtime models |

```typescript
import { createLoomAdapter, createNoopAdapter } from '@nestweaver/loom';

LoomModule.forRoot({
  adapter: createLoomAdapter('prisma', prisma),
  resources: […],
});
```

`LoomAdapter` surface: `list`, `findOne`, `findManyByIds`, `findFirst`, `create`, `update`, `delete`.

Helpers: `modelKey(meta)`, `recordIdFrom(record)` (`id` or `_id`).

### ACL persistence

When auth is enabled, Loom creates an ORM-specific `LoomRbacStore` via `createLoomRbacStore(orm, dataSource)` (or `createNoopRbacStore()` when no data source).

| ORM | Permission / role models | Notes |
|-----|--------------------------|-------|
| Mongoose | `LoomPermission`, `LoomRole` | Registered at runtime by the store |
| TypeORM | `LoomPermission`, `LoomRole` entities | Must be in `entities: […]` |
| Prisma | `LoomPermission`, `LoomRole` | `client.loomPermission` / `loomRole` |
| Drizzle | `loomPermissions`, `loomRoles` tables | Missing schema keys throw (no silent noop) |

**User field:** `roleIds` — TypeORM `simple-array`, Prisma `String[]` (Postgres/Mongo) or `Json` (MySQL/SQLite), Drizzle `text` storing JSON, Mongoose `[String]`.

Override the store by providing `LOOM_RBAC` if needed.

### Adapter quirks

- **Drizzle:** id-list fields are JSON-stringified on write; MySQL may not support `RETURNING` (Loom re-selects after insert/update).
- **Mongoose:** Role/Permission admin CRUD uses string model names (`'LoomRole'`) after the store registers schemas.
- **TypeORM:** Prefer entity class refs for Role/Permission resources so repositories resolve correctly.

---

## Base resources

From `@nestweaver/loom/base`:

| Class | Slug | Nav | Notes |
|-------|------|-----|-------|
| `CompanyResourceBase` | `companies` | Administration → Organization | Identity fields; modal; optional kanban |
| `UserResourceBase` | `users` | Administration → Users & access | `roleIds` relation table; company M2O; password; kanban |
| `RoleResourceBase` | `roles` | same | `permissionIds` checkbox list (grouped, wildcard cascade) |
| `PermissionResourceBase` | `permissions` | same | Synced catalog; create/edit/delete disabled |

```typescript
import {
  CompanyResourceBase,
  UserResourceBase,
  RoleResourceBase,
  PermissionResourceBase,
} from '@nestweaver/loom/base';

export class UserResource extends UserResourceBase {
  static override model = User;
}

export class RoleResource extends RoleResourceBase {
  static override model = LoomRole; // TypeORM class, or 'LoomRole' / 'loomRoles'
}
```

Register all four when using auth so roles and permissions are manageable in the panel.

---

## Branding & shell

### `LoomBranding`

| Field | Default |
|-------|---------|
| `brandName` | `'Admin'` |
| `primaryColor` | `#f1511b` |
| `accentColor` | `#286291` |
| `fontFamily` | system UI stack |
| `logoUrl` / `logoDarkUrl` | — |
| `copyrightText` | — |
| `fontUrl` | — |

Merge order: defaults → env → module `branding` / legacy `title` → active company `branding`.

Runtime CSS: `{basePath}/assets/branding.css`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `LOOM_BRAND_NAME` | Panel title |
| `LOOM_BRAND_LOGO_URL` | Logo (light) |
| `LOOM_BRAND_LOGO_DARK_URL` | Logo (dark) |
| `LOOM_BRAND_COPYRIGHT` | Footer copyright |
| `LOOM_BRAND_FONT_FAMILY` | CSS font-family |
| `LOOM_BRAND_FONT_URL` | Stylesheet URL for custom fonts |
| `LOOM_BRAND_PRIMARY_COLOR` | Primary hex |
| `LOOM_BRAND_ACCENT_COLOR` | Accent hex |
| `LOOM_AUTH_SECRET` | Enable auth (HMAC secret) |
| `LOOM_ADMIN_EMAIL` / `PASSWORD` / `NAME` | Scaffold seed defaults |

### Company tenancy

Enable with `auth.tenancy` and opt resources in with `companyScoped` (or `companyField`):

```typescript
auth: {
  secret: process.env.LOOM_AUTH_SECRET!,
  tenancy: {
    enabled: true,
    companyResource: 'companies',
    companyField: 'companyId',
    membershipField: 'companyIds', // default — set false for home-company only
  },
},
```

```typescript
class ContactResource extends Resource {
  static override companyScoped = true;
}
```

**User membership:** each user has `companyIds` (supported companies) plus optional home `companyId`.
Non-admins may only switch to ids in `companyIds` (falls back to home when the list is empty).
Admins can switch to any company or “All companies”. Assign membership on the Users resource.

When enabled:

- Session stores the active `companyId` (admins may clear it for “All companies”)
- Switcher lists only the user’s supported companies (admins see all)
- `companyScoped` resources are list-filtered and IDOR-checked; creates stamp the active company
- Topbar posts to `/admin/company/switch` (CSRF); JSON API: `GET /api/loom/companies`, `POST /api/loom/company/switch`

Without tenancy, `companies` / `currentCompanyId` remain branding-only:

```typescript
companies: [
  { id: 'acme', name: 'Acme', branding: { primaryColor: '#0ea5e9' } },
],
currentCompanyId: 'acme',
```

### ACL schema migrations

Nestweaver scaffolds ship migrations so production can create ACL tables without ORM auto-sync:

| ORM | Dev | Production |
|-----|-----|------------|
| TypeORM | `synchronize` when not production | `migrationsRun` on boot; or `pnpm --filter api db:migrate` |
| Prisma | `pnpm --filter api db:push` | `pnpm --filter api db:migrate` (`prisma migrate deploy`) |
| Drizzle | `pnpm --filter api db:push` | `pnpm --filter api db:migrate` (`drizzle-kit migrate`) |
| Mongoose | collections created on first write | same |

Upgrading an existing app: add `LoomRole` / `LoomPermission` (or Drizzle `loomRoles` / `loomPermissions`) then run the migrate script for your ORM. Missing Drizzle ACL schema keys fail closed instead of falling back to in-memory RBAC.
---

## Nestweaver scaffolding

When you enable the admin panel in `create-nestweaver` / `weaver`, the scaffold generates:

```
apps/api/src/admin/
  loom-admin.module.ts
  company.resource.ts
  user.resource.ts
  role.resource.ts
  permission.resource.ts
```

Plus ORM-specific ACL models:

| ORM | Generated / templated |
|-----|------------------------|
| TypeORM | Entities + `migrations/InitSchema` + `data-source.ts` (`db:migrate`; prod `migrationsRun`) |
| Prisma | Models + `prisma/migrations` (`db:migrate` / `db:push`) |
| Drizzle | Schema + `drizzle/0000_init.sql` (`db:migrate` / `db:push`) |
| Mongoose | Company/User schemas; Role/Permission registered at runtime |

`LoomModule.forRootAsync` is wired with the correct inject token and `auth.seedAdmin` from env. SPA/SSR fallbacks exclude `/admin`.

---

## Development

```bash
pnpm --filter @nestweaver/loom build:css
pnpm --filter @nestweaver/loom build
pnpm --filter @nestweaver/loom test
pnpm --filter @nestweaver/loom dev:css   # watch Tailwind
```

## Roadmap

Loom is currently **0.x / beta**. Production-readiness work is tracked in:

- Milestone: [Loom 1.0 — production stable](https://github.com/coolsam726/nestweaver/milestone/1)
- Plan: [`docs/LOOM_ROADMAP.md`](../../docs/LOOM_ROADMAP.md)

---

## License

MIT
