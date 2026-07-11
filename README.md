# nestweaver

Scaffold **NestJS + multi-frontend** monorepos with an interactive, batteries-included CLI.

Supported frontends: **Nuxt 4**, **Vite + React**, **Vite + Vue**, and **Vite + Svelte**.

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

You'll be prompted for frontend, database, ORM/ODM (filtered by database), scheduling, queues, HTTP adapter, admin panel, and Nuxt render mode (SSR/SPA) when applicable.

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

Open **http://localhost:4000**

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
2. Commit, push to `main`, and [create a GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) for the tag (e.g. `v0.1.0`).

The **Publish** workflow runs on `release: published`, builds, smoke-tests the scaffolder, then publishes `@nestweaver/loom`, `nestweaver`, and `create-nestweaver`.

### Manual publish (dry run)

GitHub → Actions → **Publish** → **Run workflow** → enable **Dry run** to validate without publishing.

### Local publish

```bash
pnpm build
pnpm --filter @nestweaver/loom publish --access public --no-git-checks
pnpm --filter nestweaver publish --access public --no-git-checks
pnpm --filter create-nestweaver publish --access public --no-git-checks
```

Users then run `npm create nestweaver@latest`.

## Packages

| Package | Role |
|---------|------|
| `@nestweaver/loom` | Declarative admin panel for NestJS (`/admin` CRUD UI) |
| `create-nestweaver` | npm entry for `npm create nestweaver` |
| `nestweaver` | Core scaffolder, templates, and `weaver` CLI |

## License

MIT
