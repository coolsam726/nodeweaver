import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTranslator } from '../src/core/i18n.js';
import { softDeleteField, softDeleteListEquals, softDeleteStamp } from '../src/core/soft-delete.js';
import { shouldPreloadRelation } from '../src/core/relations.js';
import type { ResourceMeta } from '../src/core/types.js';

describe('softDelete helpers', () => {
  const meta = { softDelete: true } as ResourceMeta;

  it('defaults field to deletedAt', () => {
    assert.equal(softDeleteField(meta), 'deletedAt');
    assert.equal(softDeleteField({ softDelete: { field: 'removedAt' } } as ResourceMeta), 'removedAt');
    assert.equal(softDeleteField({} as ResourceMeta), null);
  });

  it('stamps ISO timestamps', () => {
    const stamp = softDeleteStamp(meta);
    assert.ok(stamp?.deletedAt);
    assert.ok(String(stamp!.deletedAt).includes('T'));
  });

  it('builds list equals for active vs trash', () => {
    assert.deepEqual(softDeleteListEquals(meta, false), { deletedAt: null });
    assert.deepEqual(softDeleteListEquals(meta, 'only'), {
      deletedAt: { $loomTrashed: true },
    });
    assert.equal(softDeleteListEquals(meta, 'with'), undefined);
  });
});

describe('shouldPreloadRelation', () => {
  it('skips combobox by default', () => {
    assert.equal(
      shouldPreloadRelation({ kind: 'many2one', resource: 'users', labelField: 'name' }),
      false,
    );
    assert.equal(
      shouldPreloadRelation({
        kind: 'many2many',
        resource: 'roles',
        labelField: 'name',
        widget: 'combobox',
      }),
      false,
    );
  });

  it('preloads checkboxList unless overridden', () => {
    assert.equal(
      shouldPreloadRelation({
        kind: 'many2many',
        resource: 'permissions',
        labelField: 'name',
        widget: 'checkboxList',
      }),
      true,
    );
    assert.equal(
      shouldPreloadRelation({
        kind: 'many2many',
        resource: 'permissions',
        labelField: 'name',
        widget: 'checkboxList',
        preload: false,
      }),
      false,
    );
  });
});

describe('i18n', () => {
  it('resolves builtin and override keys', () => {
    const t = createTranslator('en', { 'auth.signIn': 'Log in' });
    assert.equal(t('auth.signIn'), 'Log in');
    assert.equal(t('flash.restored.title'), 'Restored');
    assert.equal(t('missing.key', 'fallback'), 'fallback');
  });
});
