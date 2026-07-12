import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertLoomProductionAuth } from '../src/core/assert-options.js';
import { LoginRateLimitError, LoginRateLimiter } from '../src/core/login-rate-limit.js';
import { createLoomRbacStore, createNoopRbacStore } from '../src/core/rbac-store.js';
import { resolveSortField } from '../src/core/list-query.js';
import type { ResourceMeta } from '../src/core/types.js';

describe('assertLoomProductionAuth', () => {
  it('throws in production without secret', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () =>
          assertLoomProductionAuth({
            resources: [class {} as never],
          }),
        /auth\.secret is required/,
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('allows explicit anonymous admin in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.doesNotThrow(() =>
        assertLoomProductionAuth({
          resources: [class {} as never],
          allowAnonymousAdmin: true,
        }),
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('LoginRateLimiter', () => {
  it('blocks after max attempts', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    limiter.recordFailure('1.1.1.1|a@b.c');
    limiter.recordFailure('1.1.1.1|a@b.c');
    limiter.recordFailure('1.1.1.1|a@b.c');
    assert.throws(() => limiter.assertAllowed('1.1.1.1|a@b.c'), LoginRateLimitError);
    limiter.recordSuccess('1.1.1.1|a@b.c');
    assert.doesNotThrow(() => limiter.assertAllowed('1.1.1.1|a@b.c'));
  });
});

describe('createNoopRbacStore', () => {
  it('upserts permissions and loads via role assignment', async () => {
    const store = createNoopRbacStore();
    const perm = await store.upsertPermission({
      name: 'tags:viewAny',
      resource: 'tags',
      ability: 'viewAny',
    });
    const role = await store.upsertRole({
      name: 'Viewer',
      slug: 'viewer',
      permissionIds: [perm.id],
    });
    const loaded = await store.loadPermissionNamesForUser('u1', [role.id]);
    assert.deepEqual(loaded.roles, ['viewer']);
    assert.ok(loaded.permissions.includes('tags:viewAny'));
  });
});

describe('createLoomRbacStore drizzle', () => {
  it('fails closed when ACL tables are missing from schema', () => {
    assert.throws(
      () =>
        createLoomRbacStore('drizzle', {
          db: {},
          schema: {},
        }),
      /loomPermissions \/ loomRoles/,
    );
  });
});

describe('resolveSortField', () => {
  const meta = {
    columns: [
      { name: 'name', sortable: true },
      { name: 'secret', sortable: false },
    ],
    defaultSort: { field: 'name', direction: 'asc' as const },
  } as ResourceMeta;

  it('allows sortable columns only', () => {
    assert.equal(resolveSortField(meta, { page: 1, perPage: 15, sort: 'name' }), 'name');
    assert.equal(resolveSortField(meta, { page: 1, perPage: 15, sort: 'secret' }), 'name');
    assert.equal(resolveSortField(meta, { page: 1, perPage: 15, sort: 'injected' }), 'name');
  });
});
