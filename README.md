# NestJS + Nuxt 4 Single-Port Stack

Monorepo where **NestJS** owns the HTTP server on one port in production:

- `/api/*` — NestJS API
- everything else — Nuxt 4 SSR (Nitro `listener` mounted as Express middleware)

> **Continuing in a new workspace?** Read [WORKSPACE_CONTEXT.md](./WORKSPACE_CONTEXT.md) for full architecture, gotchas, and migration steps.

## Structure

```
apps/api   — NestJS backend + production HTTP entry
apps/web   — Nuxt 4 frontend (SSR)
packages/shared — shared TypeScript types
```

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable`)

## Development

Runs Nest on port **3000** (user-facing) and Nuxt dev on **3001** (internal). Nest proxies non-API traffic to Nuxt for HMR.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

## Production

```bash
pnpm build
pnpm start:prod
```

## Docker

```bash
docker build -t nest-nuxt-stack .
docker run -p 3000:3000 nest-nuxt-stack
```

## Production notes

- Nuxt is built with the Nitro `node-listener` preset so it exports an Express-compatible `listener` middleware for Nest to mount.
- SSR API calls use `runtimeConfig.apiBaseServer` (`http://127.0.0.1:3000/api`) because Nitro does not route `/api/*` internally.
- Nuxt dev binds to `127.0.0.1:3001` so the Nest proxy can reach it reliably.

## API

- `GET /api/health` — returns `{ status: "ok", timestamp: "..." }`
