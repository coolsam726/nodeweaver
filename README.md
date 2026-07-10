# nuxest

Scaffold **NestJS + Nuxt 4** monorepos with an interactive, batteries-included CLI.

## Create a project

**After publish** (from npm):

```bash
npm create nuxest@latest my-app
pnpm create nuxest my-app
yarn create nuxest my-app
bun create nuxest my-app
```

> **Note:** `pnpm create nuxest my-app` — `nuxest` is the starter, `my-app` is your project folder.
> Do **not** run `pnpm create my-app` (that looks for a package named `create-my-app` on npm).

**Local development** (from this repo, before publish):

```bash
pnpm build
pnpm run create my-app
```

Use `.` as the directory name to scaffold into the current folder:

```bash
npm create nuxest@latest .
```

You'll be prompted for database, ORM/ODM (filtered by database), scheduling, queues, HTTP adapter, admin panel, and Nuxt mode (SSR/SPA).

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

# local scaffold (same prompts as npm create nuxest)
pnpm run create my-app

# equivalent
pnpm run create:nuxest my-app
```

## Publish to npm

### One-time setup

1. Create an [npm access token](https://www.npmjs.com/settings/~your-user/tokens) with **Publish** permission.
2. Add it to the GitHub repository as secret **`NPM_TOKEN`**.

### Release flow

1. Bump versions in `packages/nuxest/package.json` and `packages/create-nuxest/package.json` (keep them in sync).
2. Commit, push to `main`, and [create a GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) for the tag (e.g. `v0.1.0`).

The **Publish** workflow runs on `release: published`, builds, smoke-tests the scaffolder, then publishes `nuxest` and `create-nuxest`.

### Manual publish (dry run)

GitHub → Actions → **Publish** → **Run workflow** → enable **Dry run** to validate without publishing.

### Local publish

```bash
pnpm build
pnpm --filter nuxest publish --access public --no-git-checks
pnpm --filter create-nuxest publish --access public --no-git-checks
```

Users then run `npm create nuxest@latest`.

## Packages

| Package | Role |
|---------|------|
| `create-nuxest` | npm entry for `npm create nuxest` |
| `nuxest` | Core scaffolder, templates, and `nuxest` CLI |

## License

MIT
