# nestweaver

**NestJS fullstack starter + declarative admin.**

Scaffold a NestJS monorepo with your choice of frontend and **Loom** included by default — a production-minded admin panel (resources, RBAC, tenancy, media, JSON API) wired into the same app.

Supported frontends: **Nuxt 4**, **Vite + React**, **Vite + Vue**, and **Vite + Svelte**.

## Why Nestweaver

| Without Nestweaver | With Nestweaver |
|--------------------|-----------------|
| Glue Nest + SPA + Docker by hand | Interactive CLI scaffolds a working monorepo |
| Roll your own admin CRUD | Loom: declarative resources, auth, company tenancy |
| Separate “starter” vs “admin kit” stories | One stack: app API + `/admin` + JSON API |

**Loom** is the flagship library (`@nestweaver/loom`). **create-nestweaver** is how most people get a working app with Loom already configured.

## Create a project

**After publish** (from npm):

```bash
npm create nestweaver@latest my-app
pnpm create nestweaver my-app
yarn create nestweaver my-app
bun create nestweaver my-app
```

> **Note:** `pnpm create nestweaver my-app` — `nestweaver` is the starter, `my-app` is your project folder.
> Do **not** run `pnpm create my-app` (that looks for a package named `create-my-app` on npm).

**Local development** (from this repo, before publish):

```bash
pnpm build
pnpm run create my-app
```

Use `.` as the directory name to scaffold into the current folder:

```bash
npm create nestweaver@latest .
```

You'll be prompted for frontend, database, ORM/ODM (filtered by database), scheduling, queues, HTTP adapter, and Nuxt render mode (SSR/SPA) when applicable. **Loom** (`/admin`, auth/RBAC, JSON API) is always included.

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

## Development (this repo)

```bash
pnpm install
pnpm build

# local scaffold (same prompts as npm create nestweaver)
pnpm run create my-app

# equivalent
pnpm run create:weaver my-app
```

## Publish to npm

### One-time setup

1. Create an [npm access token](https://www.npmjs.com/settings/~your-user/tokens) with **Publish** permission.
2. Add it to the GitHub repository as secret **`NPM_TOKEN`**.
3. On first release, publishing `@nestweaver/loom` creates the public **`@nestweaver`** scope on npm.

### Release flow

1. Bump versions in `packages/loom/package.json`, `packages/nestweaver/package.json`, and `packages/create-nestweaver/package.json` (keep versions in sync).
2. Commit, push to `main`, and [create a GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) for the tag (e.g. `v0.1.0` or `v1.0.0`).

The **Publish** workflow runs on `release: published`, builds, smoke-tests the scaffolder, then publishes `@nestweaver/loom`, `nestweaver`, and `create-nestweaver`.

### Manual publish (dry run)

GitHub → Actions → **Publish** → **Run workflow** → enable **Dry run** to validate without publishing.

### Local publish

```bash
pnpm build
pnpm --filter @nestweaver/loom publish --access public --no-git-checks
pnpm --filter nestweaver publish --no-git-checks
pnpm --filter create-nestweaver publish --no-git-checks
```

Users then run `npm create nestweaver@latest`.

## Packages

| Package | Role |
|---------|------|
| [`@nestweaver/loom`](packages/loom/README.md) | Declarative NestJS admin (`/admin`): resources, RBAC, tenancy, media, JSON API |
| `create-nestweaver` | npm entry for `npm create nestweaver` |
| [`nestweaver`](packages/nestweaver/README.md) | Core scaffolder, templates, and `weaver` CLI |

Scaffolds always include Loom with ORM-matched Role/Permission models, seed auth, local media storage, audit hooks, and an OpenAPI document under `/api/loom/v1`. See the [Loom README](packages/loom/README.md) for the full feature guide.

**Loom 1.0:** [readiness checklist](docs/LOOM_1_0.md) · [roadmap](docs/LOOM_ROADMAP.md) · [milestone](https://github.com/coolsam726/nestweaver/milestone/1)

## License

MIT
