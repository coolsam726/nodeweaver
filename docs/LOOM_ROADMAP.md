# Loom production roadmap

Path to **`@nestweaver/loom` 1.0 — production stable**.

**Milestone:** [Loom 1.0 — production stable](https://github.com/coolsam726/nestweaver/milestone/1) (target ~2026-09-06)

Until Critical + High are done, treat Loom as **beta / early admin**, not a production identity or tenancy control plane.

---

## Waves

| Wave | Priority | Focus | When |
|------|----------|--------|------|
| **1** | Critical | Security foundations, tests, migrations, tenancy honesty | First |
| **2** | High | Fail-closed auth, IDOR/sort hardening, password reset, docs honesty | After wave 1 |
| **3** | Medium | Observability, ACL on relations, a11y/i18n, soft deletes | Before or with 1.0 |
| **4** | Nice-to-have | Media, audit, bulk/export, OpenAPI, CSP, deprecations | Post-1.0 OK |

---

## Wave 1 — Critical

| Issue | Title |
|-------|--------|
| [#9](https://github.com/coolsam726/nestweaver/issues/9) | Automated test suite (auth, RBAC, adapters, policies) |
| [#10](https://github.com/coolsam726/nestweaver/issues/10) | Login rate limiting / brute-force protection |
| [#11](https://github.com/coolsam726/nestweaver/issues/11) | CSRF protection for cookie-authenticated mutations |
| [#12](https://github.com/coolsam726/nestweaver/issues/12) | Server-side session revocation |
| [#13](https://github.com/coolsam726/nestweaver/issues/13) | Real tenant/company enforcement — shipped via `auth.tenancy` + `companyScoped` (PR #42) |
| [#14](https://github.com/coolsam726/nestweaver/issues/14) | ACL schema migrations for all ORMs |

## Wave 2 — High

| Issue | Title |
|-------|--------|
| [#15](https://github.com/coolsam726/nestweaver/issues/15) | Password reset / account recovery |
| [#16](https://github.com/coolsam726/nestweaver/issues/16) | Fail closed when auth misconfigured in production |
| [#17](https://github.com/coolsam726/nestweaver/issues/17) | Default record-level IDOR protection with list scope |
| [#18](https://github.com/coolsam726/nestweaver/issues/18) | Whitelist sortable columns |
| [#19](https://github.com/coolsam726/nestweaver/issues/19) | README honesty pass |
| [#20](https://github.com/coolsam726/nestweaver/issues/20) | Disable plaintext password verify in production |

## Wave 3 — Medium

| Issue | Title |
|-------|--------|
| [#21](https://github.com/coolsam726/nestweaver/issues/21) | Structured logging / request IDs / error hooks |
| [#22](https://github.com/coolsam726/nestweaver/issues/22) | Relation search respects related-resource ACL/scope |
| [#23](https://github.com/coolsam726/nestweaver/issues/23) | Harden email login lookup |
| [#24](https://github.com/coolsam726/nestweaver/issues/24) | Narrow session cookie Path |
| [#25](https://github.com/coolsam726/nestweaver/issues/25) | Accessibility pass |
| [#26](https://github.com/coolsam726/nestweaver/issues/26) | i18n foundation |
| [#27](https://github.com/coolsam726/nestweaver/issues/27) | Relation option performance + instrumentation |
| [#28](https://github.com/coolsam726/nestweaver/issues/28) | Soft deletes + restore |

## Wave 4 — Nice-to-have

| Issue | Title |
|-------|--------|
| [#29](https://github.com/coolsam726/nestweaver/issues/29) | File / media field type + storage adapter |
| [#30](https://github.com/coolsam726/nestweaver/issues/30) | Audit logging |
| [#31](https://github.com/coolsam726/nestweaver/issues/31) | Bulk actions UI + export helpers |
| [#32](https://github.com/coolsam726/nestweaver/issues/32) | JSON API versioning + OpenAPI |
| [#33](https://github.com/coolsam726/nestweaver/issues/33) | Security headers (CSP) guidance |
| [#34](https://github.com/coolsam726/nestweaver/issues/34) | Remove / gate deprecated APIs |

---

## 1.0 exit criteria

- [ ] All **Critical** and **High** issues closed (or explicitly deferred with README callouts)
- [ ] CI runs Loom tests
- [x] Production scaffold creates ACL tables without `synchronize: true`
- [x] Auth fail-closed in production without secret
- [x] Sessions revocable; login rate-limited; CSRF covered
- [x] Docs match shipped behavior (Wave 1)

## Suggested implementation order inside Wave 1

_(Complete.)_ Tests → fail-closed → rate limit → CSRF → sessions → migrations → tenancy honesty.

Then Wave 2 remaining items, then Wave 3 as capacity allows.

## Progress

Shipped in foundations PR (partial Wave 1 + quick High wins):

- [#9](https://github.com/coolsam726/nestweaver/issues/9) — initial unit tests (abilities, auth, rate limit, RBAC noop, sort whitelist)
- [#10](https://github.com/coolsam726/nestweaver/issues/10) — login rate limiting
- [#16](https://github.com/coolsam726/nestweaver/issues/16) — production fail-closed without `auth.secret`
- [#18](https://github.com/coolsam726/nestweaver/issues/18) — sortable column whitelist
- [#19](https://github.com/coolsam726/nestweaver/issues/19) — README honesty pass
- [#20](https://github.com/coolsam726/nestweaver/issues/20) — plaintext password verify disabled in production by default

Still open for Wave 1: _(none — Wave 1 Critical closed)_.

Also shipped: [#11](https://github.com/coolsam726/nestweaver/issues/11) CSRF, [#12](https://github.com/coolsam726/nestweaver/issues/12) session revocation, [#24](https://github.com/coolsam726/nestweaver/issues/24) configurable `cookiePath`, [#13](https://github.com/coolsam726/nestweaver/issues/13) full company tenancy (session switcher, `companyIds` membership, scoped resources — PR #42), [#14](https://github.com/coolsam726/nestweaver/issues/14) ACL migrations + Drizzle fail-closed.

Wave 2 High remaining: _(none after #15 + #17)_ — also previously closed from Wave 2 early: #16, #18, #19, #20.

Also shipped in Wave 2 PR: [#15](https://github.com/coolsam726/nestweaver/issues/15) password reset, [#17](https://github.com/coolsam726/nestweaver/issues/17) IDOR guard via `scopeList` on record access.

Wave 3: _(complete)_ — [#21](https://github.com/coolsam726/nestweaver/issues/21)–[#28](https://github.com/coolsam726/nestweaver/issues/28) including soft deletes, a11y focus, i18n, relation perf (PR #41).

Wave 4 _(in progress)_:

- [#33](https://github.com/coolsam726/nestweaver/issues/33) — opt-in `securityHeaders` + Loom-compatible default CSP
- [#34](https://github.com/coolsam726/nestweaver/issues/34) — one-time deprecation warnings for legacy APIs

Open: [#29](https://github.com/coolsam726/nestweaver/issues/29) media, [#30](https://github.com/coolsam726/nestweaver/issues/30) audit, [#31](https://github.com/coolsam726/nestweaver/issues/31) bulk/export, [#32](https://github.com/coolsam726/nestweaver/issues/32) OpenAPI.
