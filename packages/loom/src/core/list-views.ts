import { buildListQueryString, type ListViewQuery } from './list-query.js';
import type { ResourceMeta } from './types.js';

export type ListViewId = 'table' | 'kanban' | (string & {});

export type { ListViewQuery };

export interface ListViewOption {
  id: ListViewId;
  label: string;
  icon: string;
  href: string;
  active: boolean;
}

export function buildListViews(
  meta: ResourceMeta,
  basePath: string,
  currentView: ListViewId,
  query: ListViewQuery = {},
): ListViewOption[] {
  const views: ListViewOption[] = [
    {
      id: 'table',
      label: 'Table',
      icon: 'table-cells',
      href: `${basePath}/${meta.slug}${tableListQuery(query)}`,
      active: currentView === 'table',
    },
  ];

  if (meta.hasKanban) {
    views.push({
      id: 'kanban',
      label: 'Kanban',
      icon: 'view-columns',
      href: `${basePath}/${meta.slug}/kanban${kanbanListQuery(query)}`,
      active: currentView === 'kanban',
    });
  }

  return views;
}

export function showListViewSwitcher(views: ListViewOption[]): boolean {
  return views.length > 1;
}

function tableListQuery(query: ListViewQuery): string {
  return buildListQueryString(query);
}

function kanbanListQuery(query: ListViewQuery): string {
  return buildListQueryString(query);
}
