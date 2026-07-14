# nodeweaver

**NestJS fullstack starter + declarative admin.**

Scaffold a NestJS monorepo with your choice of frontend and **Loom** included by default — a production-minded admin panel (resources, RBAC, tenancy, media, JSON API) wired into the same app.

Supported frontends: **Nuxt 4**, **Angular**, **Vite + React / Vue / Svelte**, and **Nest + Handlebars + Alpine** (full stack — no separate `apps/web`; public UI shares Loom sessions and branding).

## Why Nodeweaver

| Without Nodeweaver | With Nodeweaver |
|--------------------|-----------------|
| Glue Nest + SPA + Docker by hand | Interactive CLI scaffolds a working monorepo |
| Roll your own admin CRUD | Loom: declarative resources, auth, company tenancy |
| Separate “starter” vs “admin kit” stories | One stack: app API + `/admin` + JSON API |

**Loom** is the flagship library (`@nodeweaver/loom`). **create-nodeweaver** is how most people get a working app with Loom already configured.

## Create a project

**After publish** (from npm):

```bash
npm create nodeweaver@latest my-app
pnpm create nodeweaver my-app
yarn create nodeweaver my-app
bun create nodeweaver my-app
```

> **Note:** `pnpm create nodeweaver my-app` — `nodeweaver` is the starter, `my-app` is your project folder.
> Do **not** run `pnpm create my-app` (that looks for a package named `create-my-app` on npm).

**Local development** (from this repo, before publish):

```bash
pnpm build
pnpm run create my-app
```

Use `.` as the directory name to scaffold into the current folder:

```bash
npm create nodeweaver@latest .
```

You'll be prompted for frontend, database, ORM/ODM (filtered by database), scheduling, queues, HTTP adapter, and Nuxt/Angular render mode (SSR/SPA) when applicable. **Loom** (`/admin`, auth/RBAC, JSON API) is always included.

Choosing **Nest + Handlebars + Alpine** scaffolds a single-process full-stack app: public pages and `/login` live in `apps/api` (shared cookies/theme/branding with `/admin`), with no `apps/web` package.

## After scaffolding

**Full Docker dev stack** (app + database + Redis, etc.):

```bash
cd my-app
docker compose up --build
```

**Local app with Docker infra only**:

```bash
cd my-app
cp .env.example .env
docker compose up -d postgres redis   # service names match your choices
pnpm dev
```

Every project includes `docker-compose.yml` and a `dev` Dockerfile stage. The `app` service runs `pnpm dev` with hot reload; infrastructure services are included based on your scaffold options.

Open **http://localhost:4000** — and **http://localhost:4000/admin** when Loom is enabled (seed credentials from `.env`).

To host under a subdirectory (e.g. `https://example.net/my-app/`), set `APP_BASE_PATH=/my-app` and forward that prefix to Nest **without stripping it**. Auth, admin, API, and cookies all use the same prefix.

## Development (this repo)

```bash
pnpm install
pnpm build

# local scaffold (same prompts as npm create nodeweaver)
pnpm run create my-app

# equivalent
pnpm run create:weaver my-app
```

## Publish to npm

### One-time setup

1. Create the public npm organization **`nodeweaver`** (creates the `@nodeweaver` scope).
2. Prefer [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) on each package for GitHub Actions (workflow: `publish.yml`). You do not need a write `NPM_TOKEN` for OIDC publishes.
3. Optional: a read-only token only if CI must install private packages.

### Release flow

**Lockstep versions:** `@nodeweaver/loom`, `nodeweaver`, and `create-nodeweaver` always share the same version. Never bump one without the others. Any change destined for the next npm release must include that shared bump before publishing.

1. Bump the shared version in `packages/loom/package.json`, `packages/nodeweaver/package.json`, and `packages/create-nodeweaver/package.json` (and any caret fallbacks that assume that version).
2. Commit, push to `main`, and [create a GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) for the tag (e.g. `v0.1.2`).

The **Publish** workflow runs on `release: published`, builds, smoke-tests the scaffolder, then publishes `@nodeweaver/loom`, `nodeweaver`, and `create-nodeweaver`.

### Manual publish (dry run)

GitHub → Actions → **Publish** → **Run workflow** → enable **Dry run** to validate without publishing.

### Local publish

```bash
pnpm build
pnpm --filter @nodeweaver/loom publish --access public --no-git-checks
pnpm --filter nodeweaver publish --no-git-checks
pnpm --filter create-nodeweaver publish --no-git-checks
```

Users then run `npm create nodeweaver@latest`.

## Packages

| Package | Role |
|---------|------|
| [`@nodeweaver/loom`](packages/loom/README.md) | Declarative NestJS admin (`/admin`): resources, RBAC, tenancy, media, JSON API |
| `create-nodeweaver` | npm entry for `npm create nodeweaver` |
| [`nodeweaver`](packages/nodeweaver/README.md) | Core scaffolder, templates, and `nodeweaver` / `weaver` CLI |

Scaffolds always include Loom with ORM-matched Role/Permission models, seed auth, local media storage, audit hooks, and an OpenAPI document under `/api/loom/v1`. See the [Loom README](packages/loom/README.md) for the full feature guide.

**Loom 1.0:** [readiness checklist](docs/LOOM_1_0.md) · [roadmap](docs/LOOM_ROADMAP.md) · [milestone](https://github.com/coolsam726/nodeweaver/milestone/1)

## License

MIT
