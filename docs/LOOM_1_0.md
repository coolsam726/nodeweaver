# Loom 1.0 readiness

Checklist to call **`@nestweaver/loom` 1.0 — production stable**.

Target: [milestone](https://github.com/coolsam726/nestweaver/milestone/1) (~2026-09-06).

## Product stance

- **Nestweaver** scaffolds NestJS + frontend monorepos.
- **Loom** is the flagship: declarative admin, auth/RBAC, tenancy, JSON API.
- Treat Loom as a **library** apps depend on; the scaffolder is how most people get it.

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Waves 1–2 (Critical + High) closed | Done |
| Waves 3–4 (Medium + nice-to-have) closed | Done |
| CI runs Loom unit tests (`pnpm test` → `@nestweaver/loom test`) | Done |
| Production ACL without `synchronize: true` | Done |
| Auth fail-closed without secret | Done |
| Sessions revocable; login rate-limited; CSRF | Done |
| Docs match shipped behavior | Ongoing — refresh on each release |
| npm publish `@nestweaver/loom` + `create-nestweaver` | Pending first GitHub Release |
| Deprecation freeze for 1.0 (no silent removals) | Pending — warn-only until 2.0 |

## Release steps

1. Confirm `pnpm test` green on `main`.
2. Bump versions in `packages/loom`, `packages/nestweaver`, `packages/create-nestweaver` (keep in sync).
3. Tag `v1.0.0` and create a GitHub Release (triggers Publish workflow).
4. Verify `npm create nestweaver@latest` with admin enabled boots `/admin`.
5. Announce: Loom is the NestJS admin; Nestweaver is how you start.

## Post-1.0 (not blockers)

- Built-in S3 storage adapter
- Audit log admin resource (persist via `onAudit` today)
- Stricter CSP (nonces / self-hosted Alpine)
- Typed client from OpenAPI for scaffolded frontends
