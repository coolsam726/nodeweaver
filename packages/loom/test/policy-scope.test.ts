import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LoomAuthorizationError } from '../src/core/abilities.js';
import type { LoomAuthUser } from '../src/core/auth.js';
import {
  Policy,
  assertPolicy,
  recordMatchesScope,
  type LoomQueryScope,
} from '../src/core/policy.js';
import { userHasPermission } from '../src/core/abilities.js';

function user(partial: Partial<LoomAuthUser> & { id: string }): LoomAuthUser {
  return {
    name: 'Test',
    email: 't@example.com',
    permissions: ['orders:view', 'orders:edit', 'orders:delete', 'orders:viewAny'],
    ...partial,
  };
}

class OwnedOrderPolicy extends Policy {
  static override ownerField = 'createdById';

  static override view(u: LoomAuthUser, _record: Record<string, unknown>) {
    return userHasPermission(u, 'orders', 'view');
  }

  static override edit(u: LoomAuthUser, _record: Record<string, unknown>) {
    return userHasPermission(u, 'orders', 'edit');
  }

  static override delete(u: LoomAuthUser, _record: Record<string, unknown>) {
    return userHasPermission(u, 'orders', 'delete');
  }

  static override scopeList(u: LoomAuthUser): LoomQueryScope | undefined {
    if (u.permissions?.includes('*') || u.permissions?.includes('orders:*')) {
      return undefined;
    }
    return { equals: { createdById: u.id } };
  }
}

describe('recordMatchesScope', () => {
  it('passes when scope is empty', () => {
    assert.equal(recordMatchesScope({ id: '1' }, undefined), true);
    assert.equal(recordMatchesScope({ id: '1' }, {}), true);
  });

  it('requires equality filters', () => {
    assert.equal(
      recordMatchesScope({ createdById: 'u1' }, { equals: { createdById: 'u1' } }),
      true,
    );
    assert.equal(
      recordMatchesScope({ createdById: 'u2' }, { equals: { createdById: 'u1' } }),
      false,
    );
  });
});

describe('assertPolicy IDOR via scopeList', () => {
  it('allows in-scope records', () => {
    assert.doesNotThrow(() =>
      assertPolicy(
        OwnedOrderPolicy,
        'view',
        user({ id: 'u1' }),
        'orders',
        { id: 'o1', createdById: 'u1' },
      ),
    );
  });

  it('rejects out-of-scope ids even when permission allows', () => {
    assert.throws(
      () =>
        assertPolicy(
          OwnedOrderPolicy,
          'view',
          user({ id: 'u1' }),
          'orders',
          { id: 'o2', createdById: 'u2' },
        ),
      LoomAuthorizationError,
    );
    assert.throws(
      () =>
        assertPolicy(
          OwnedOrderPolicy,
          'edit',
          user({ id: 'u1' }),
          'orders',
          { id: 'o2', createdById: 'u2' },
        ),
      /access this orders record/,
    );
  });

  it('skips scope when scopeList returns undefined (admin)', () => {
    assert.doesNotThrow(() =>
      assertPolicy(
        OwnedOrderPolicy,
        'view',
        user({ id: 'admin', permissions: ['*'] }),
        'orders',
        { id: 'o2', createdById: 'u2' },
      ),
    );
  });
});
