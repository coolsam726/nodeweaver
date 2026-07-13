import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LoomAuthUser } from '../src/core/auth.js';
import {
  LOOM_ALL_COMPANIES,
  companyScopeForUser,
  membershipCompanyIds,
  mergeQueryScopes,
  recordMatchesCompany,
  resolveDefaultCompanyId,
  resourceCompanyField,
  tenancyEnabled,
  tenancyMembershipField,
} from '../src/core/tenancy.js';
import type { ResourceMeta } from '../src/core/types.js';

function user(partial: Partial<LoomAuthUser> & { id: string }): LoomAuthUser {
  return {
    name: 'Test',
    email: 't@example.com',
    permissions: ['contacts:viewAny'],
    ...partial,
  };
}

function meta(partial: Partial<ResourceMeta>): ResourceMeta {
  return {
    slug: 'contacts',
    label: 'Contacts',
    singularLabel: 'Contact',
    model: 'Contact',
    fields: [],
    form: { sections: [], fields: [] },
    columns: [],
    infolist: { sections: [] },
    actions: [],
    searchableFields: [],
    hasKanban: false,
    hasDetail: true,
    hasExplicitDetail: false,
    presentation: { form: 'page', detail: 'page' },
    customPermissions: [],
    ...partial,
  } as ResourceMeta;
}

describe('tenancyEnabled', () => {
  it('is false when unset or false', () => {
    assert.equal(tenancyEnabled(undefined), false);
    assert.equal(tenancyEnabled(false), false);
  });

  it('is true for empty config object', () => {
    assert.equal(tenancyEnabled({}), true);
  });

  it('respects enabled: false', () => {
    assert.equal(tenancyEnabled({ enabled: false }), false);
  });
});

describe('resourceCompanyField', () => {
  it('returns null when resource is not scoped', () => {
    assert.equal(resourceCompanyField(meta({})), null);
  });

  it('uses companyScoped default and config override', () => {
    assert.equal(resourceCompanyField(meta({ companyScoped: true })), 'companyId');
    assert.equal(
      resourceCompanyField(meta({ companyScoped: true }), { companyField: 'tenantId' }),
      'tenantId',
    );
    assert.equal(resourceCompanyField(meta({ companyField: 'orgId' })), 'orgId');
  });
});

describe('companyScopeForUser', () => {
  it('fail-closes without user or company', () => {
    assert.deepEqual(companyScopeForUser(null, 'companyId'), {
      equals: { companyId: '__loom_no_company__' },
    });
    assert.deepEqual(
      companyScopeForUser(user({ id: '1', companyId: undefined }), 'companyId'),
      { equals: { companyId: '__loom_no_company__' } },
    );
  });

  it('scopes non-admins to active company', () => {
    assert.deepEqual(
      companyScopeForUser(user({ id: '1', companyId: 'acme' }), 'companyId'),
      { equals: { companyId: 'acme' } },
    );
  });

  it('leaves admins unscoped when no active company', () => {
    assert.equal(
      companyScopeForUser(
        user({ id: '1', permissions: ['*'], companyId: undefined }),
        'companyId',
      ),
      undefined,
    );
  });

  it('scopes admins when a company is selected', () => {
    assert.deepEqual(
      companyScopeForUser(
        user({ id: '1', permissions: ['*'], companyId: 'acme' }),
        'companyId',
      ),
      { equals: { companyId: 'acme' } },
    );
  });
});

describe('recordMatchesCompany', () => {
  it('allows admin all-companies mode', () => {
    assert.equal(
      recordMatchesCompany(
        { companyId: 'x' },
        'companyId',
        undefined,
        user({ id: '1', permissions: ['*'] }),
      ),
      true,
    );
  });

  it('enforces company match for scoped users', () => {
    const u = user({ id: '1', companyId: 'acme' });
    assert.equal(recordMatchesCompany({ companyId: 'acme' }, 'companyId', 'acme', u), true);
    assert.equal(recordMatchesCompany({ companyId: 'other' }, 'companyId', 'acme', u), false);
  });
});

describe('mergeQueryScopes', () => {
  it('merges equals maps', () => {
    assert.deepEqual(
      mergeQueryScopes({ equals: { a: 1 } }, { equals: { b: 2 } }),
      { equals: { a: 1, b: 2 } },
    );
  });
});

describe('tenancyMembershipField', () => {
  it('defaults to companyIds', () => {
    assert.equal(tenancyMembershipField({}), 'companyIds');
    assert.equal(tenancyMembershipField(undefined), 'companyIds');
  });

  it('can disable membership list', () => {
    assert.equal(tenancyMembershipField({ membershipField: false }), undefined);
  });
});

describe('membershipCompanyIds', () => {
  it('uses membership list as the only allowed set when present', () => {
    assert.deepEqual(
      membershipCompanyIds({ companyIds: ['b', 'c'] }, 'a', 'companyIds').sort(),
      ['b', 'c'],
    );
  });

  it('falls back to home when membership list is empty', () => {
    assert.deepEqual(
      membershipCompanyIds({ companyIds: [] }, 'a', 'companyIds'),
      ['a'],
    );
  });

  it('parses comma strings', () => {
    assert.deepEqual(
      membershipCompanyIds({ companyIds: 'b, c' }, 'home', 'companyIds').sort(),
      ['b', 'c'],
    );
  });
});

describe('resolveDefaultCompanyId', () => {
  it('prefers home company when it is in memberships', () => {
    assert.equal(
      resolveDefaultCompanyId({ companyIds: ['b', 'a'] }, 'a', 'companyIds'),
      'a',
    );
  });

  it('falls back to first membership when home is missing or outside list', () => {
    assert.equal(
      resolveDefaultCompanyId({ companyIds: ['b', 'c'] }, 'a', 'companyIds'),
      'b',
    );
    assert.equal(
      resolveDefaultCompanyId({ companyIds: ['b', 'c'] }, undefined, 'companyIds'),
      'b',
    );
  });
});

describe('LOOM_ALL_COMPANIES', () => {
  it('is empty string session marker', () => {
    assert.equal(LOOM_ALL_COMPANIES, '');
  });
});
