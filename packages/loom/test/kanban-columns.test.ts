import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupKanbanRecords, KanbanBuilder } from '../src/core/kanban.js';

describe('kanban columns', () => {
  it('builds ordered grouped columns including empties', () => {
    const schema = new KanbanBuilder()
      .groupBy('stage')
      .columns('lead', 'qualified', 'won')
      .card('title')
      .build();

    const columns = groupKanbanRecords(
      [
        { id: '1', title: 'A', stage: 'won' },
        { id: '2', title: 'B', stage: 'lead' },
      ],
      schema.groupBy,
      { columnOrder: schema.columns },
    );

    assert.deepEqual(
      columns.map((column) => ({ key: column.key, count: column.items.length })),
      [
        { key: 'lead', count: 1 },
        { key: 'qualified', count: 0 },
        { key: 'won', count: 1 },
      ],
    );
  });
});
