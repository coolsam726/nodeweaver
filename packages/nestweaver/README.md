# weaver CLI

Core scaffolder used by `create-nestweaver` and the `weaver` binary.

## Usage

```bash
npm create nestweaver@latest my-app

# from this monorepo
pnpm --filter nestweaver dev my-app
node packages/nestweaver/dist/cli.js my-app
```

## Programmatic API

```ts
import { runCreate, collectOptions, scaffoldProject } from 'nestweaver';
```

## Admin panel (Loom)

When you enable the admin panel during prompts, Nestweaver scaffolds a full [Loom](../loom/README.md) setup:

- `apps/api/src/admin/loom-admin.module.ts` — `LoomModule.forRootAsync` with ORM inject + auth
- Resources: Company, User, Role, Permission (extending `@nestweaver/loom/base`)
- ACL models matched to the selected ORM:
  - **TypeORM** — `LoomRole` / `LoomPermission` entities registered in `DatabaseModule`, plus `migrations/` + `data-source.ts` (`db:migrate`; prod `migrationsRun`)
  - **Prisma** — `LoomRole` / `LoomPermission` in `schema.prisma` + initial `prisma/migrations` (`db:migrate` / `db:push`)
  - **Drizzle** — `loomRoles` / `loomPermissions` tables + `drizzle/0000_init.sql` (`db:migrate` / `db:push`)
  - **Mongoose** — Company/User schemas; Role/Permission registered at runtime by Loom

### Env vars (scaffolded)

| Variable | Purpose |
|----------|---------|
| `LOOM_AUTH_SECRET` | Enables cookie auth + RBAC |
| `LOOM_ADMIN_EMAIL` | Seed admin email (default `admin@example.com`) |
| `LOOM_ADMIN_PASSWORD` | Seed admin password (default `password`) |
| `LOOM_ADMIN_NAME` | Seed admin display name |
| `LOOM_BRAND_*` | Optional branding overrides (see Loom README) |

After `docker compose up` / `pnpm dev`, open `/admin` and sign in with the seed credentials.

For production databases, run `pnpm --filter api db:migrate` (TypeORM also applies migrations automatically when `NODE_ENV=production`).

Full feature docs: [`@nestweaver/loom` README](../loom/README.md).
