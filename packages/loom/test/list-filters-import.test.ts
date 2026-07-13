import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filtersToEquals,
  groupListRecords,
  listColumnHeaders,
  parseListFilters,
  resolveGroupByField,
} from '../src/core/list-filters.js';
import { parseImportCsv } from '../src/core/import.js';
import { normalizeListQuery } from '../src/core/list-query.js';
import type { ResourceMeta } from '../src/core/types.js';

const meta = {
  slug: 'deals',
  label: 'Deals',
  singularLabel: 'Deal',
  model: 'Deal',
  fields: [
    { name: 'title', type: 'text' as const },
    {
      name: 'stage',
      type: 'select' as const,
      options: [
        { label: 'Lead', value: 'lead' },
        { label: 'Won', value: 'won' },
      ],
    },
    { name: 'active', type: 'boolean' as const },
    {
      name: 'contactId',
      type: 'relation' as const,
      relation: { kind: 'many2one' as const, resource: 'contacts', labelField: 'name' },
    },
  ],
  form: { sections: [], fields: [] },
  columns: [
    { name: 'title', type: 'text' as const, searchable: true, sortable: true },
    { name: 'stage', type: 'text' as const, sortable: true },
    { name: 'active', type: 'boolean' as const, sortable: true },
    {
      name: 'contact.displayName',
      type: 'relation' as const,
      relation: {
        kind: 'many2one' as const,
        resource: 'contacts',
        labelField: 'displayName',
        foreignKey: 'contactId',
      },
    },
  ],
  infolist: { sections: [] },
  actions: [],
  searchableFields: ['title'],
  hasKanban: false,
  hasDetail: true,
  hasExplicitDetail: false,
  presentation: { form: 'page' as const, detail: 'page' as const },
  customPermissions: [],
} satisfies ResourceMeta;

describe('list filters', () => {
  it('derives filter/group kinds from columns and fields', () => {
    const headers = listColumnHeaders(meta);
    assert.equal(headers.find((h) => h.name === 'stage')?.filter_kind, 'select');
    assert.equal(headers.find((h) => h.name === 'active')?.filter_kind, 'boolean');
    assert.equal(headers.find((h) => h.name === 'contact.displayName')?.filter_kind, 'm2o');
    assert.equal(headers.find((h) => h.name === 'contact.displayName')?.filterField, 'contactId');
  });

  it('parses filter chips into equality scope', () => {
    const chips = parseListFilters(
      JSON.stringify([
        { field: 'active', op: '=', value: true, label: 'Active: Yes' },
        { field: 'stage', op: '=', value: 'lead', label: 'Stage: Lead' },
      ]),
    );
    assert.deepEqual(filtersToEquals(meta, chips), { active: true, stage: 'lead' });
  });

  it('groups records and normalizes all/groupBy query', () => {
    const groups = groupListRecords(
      [
        { id: '1', stage: 'lead' },
        { id: '2', stage: 'lead' },
        { id: '3', stage: 'won' },
      ],
      'stage',
      meta.columns.find((c) => c.name === 'stage'),
      meta,
    );
    assert.equal(groups.length, 2);
    assert.equal(resolveGroupByField(meta, 'stage'), 'stage');
    const query = normalizeListQuery({ perPage: 'all', groupBy: 'active' });
    assert.equal(query.perPage, 500);
    assert.equal(query.page, 1);
    assert.equal(query.groupBy, 'active');
  });
});

describe('import csv', () => {
  it('maps header labels to field names', () => {
    const csv = 'Title,Stage,Active\nAcme,lead,true\n';
    const parsed = parseImportCsv(csv, meta);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.rows.length, 1);
    assert.deepEqual(parsed.rows[0], { title: 'Acme', stage: 'lead', active: true });
  });
});
