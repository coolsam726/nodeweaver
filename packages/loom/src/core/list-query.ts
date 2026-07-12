import type { ListQuery, PaginatedResult, ResourceMeta, SortDirection } from './types.js';

export interface ListViewQuery {
  search?: string;
  sort?: string;
  direction?: string;
  perPage?: number | string;
  page?: number | string;
  trashed?: string | boolean;
}

export interface PaginationLink {
  type: 'page' | 'ellipsis';
  page?: number;
  label?: string;
  active?: boolean;
  href?: string;
}

export interface PaginationContext {
  page: number;
  pageCount: number;
  total: number;
  formAction: string;
  prevHref?: string;
  nextHref?: string;
  links: PaginationLink[];
}

export type ListPathView = 'table' | 'kanban';

export function listCollectionPath(
  basePath: string,
  slug: string,
  view: ListPathView = 'table',
): string {
  return view === 'kanban' ? `${basePath}/${slug}/kanban` : `${basePath}/${slug}`;
}

export function normalizeListQuery(
  raw: {
    page?: number | string;
    perPage?: number | string;
    search?: string;
    sort?: string;
    direction?: SortDirection;
    trashed?: string | boolean;
  },
  defaults?: { perPage?: number },
): ListQuery {
  const sort = typeof raw.sort === 'string' ? raw.sort.trim() || undefined : undefined;
  const direction: SortDirection | undefined =
    raw.direction === 'asc' || raw.direction === 'desc' ? raw.direction : undefined;
  const search = typeof raw.search === 'string' ? raw.search.trim() || undefined : undefined;
  const trashedRaw = raw.trashed;
  const trashed =
    trashedRaw === true ||
    trashedRaw === '1' ||
    trashedRaw === 'true' ||
    trashedRaw === 'only'
      ? ('only' as const)
      : trashedRaw === 'with' || trashedRaw === 'all'
        ? ('with' as const)
        : false;

  return {
    page: Math.max(1, Number(raw.page) || 1),
    perPage: Math.min(100, Math.max(5, Number(raw.perPage) || defaults?.perPage || 15)),
    search,
    sort,
    direction: sort ? direction : undefined,
    trashed,
  };
}

export function buildListQueryString(
  query: ListViewQuery = {},
  overrides: ListViewQuery = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  const search = merged.search != null ? String(merged.search).trim() : '';
  if (search) params.set('search', search);

  const sort = merged.sort != null ? String(merged.sort).trim() : '';
  if (sort) {
    params.set('sort', sort);
    if (merged.direction === 'asc' || merged.direction === 'desc') {
      params.set('direction', merged.direction);
    }
  }

  const perPage = Number(merged.perPage);
  if (perPage && perPage !== 15) params.set('perPage', String(perPage));

  const page = Number(merged.page);
  if (page > 1) params.set('page', String(page));

  if (
    merged.trashed === true ||
    merged.trashed === '1' ||
    merged.trashed === 'true' ||
    merged.trashed === 'only'
  ) {
    params.set('trashed', '1');
  } else if (merged.trashed === 'with' || merged.trashed === 'all') {
    params.set('trashed', 'with');
  }

  const value = params.toString();
  return value ? `?${value}` : '';
}

export function listResourcePath(
  basePath: string,
  slug: string,
  query: ListViewQuery = {},
  overrides: ListViewQuery = {},
  view: ListPathView = 'table',
): string {
  return `${listCollectionPath(basePath, slug, view)}${buildListQueryString(query, overrides)}`;
}

export function paginationWindow(
  current: number,
  pageCount: number,
): Array<number | 'ellipsis'> {
  if (pageCount <= 1) return pageCount === 1 ? [1] : [];
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, current]);
  for (let offset = -1; offset <= 1; offset += 1) {
    const page = current + offset;
    if (page >= 1 && page <= pageCount) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index]!;
    if (index > 0 && page - sorted[index - 1]! > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }
  return result;
}

export function buildPaginationContext(
  basePath: string,
  slug: string,
  query: ListQuery,
  result: PaginatedResult,
  view: ListPathView = 'table',
): PaginationContext {
  const links: PaginationLink[] = paginationWindow(result.page, result.pageCount).map((entry) => {
    if (entry === 'ellipsis') {
      return { type: 'ellipsis' };
    }
    return {
      type: 'page',
      page: entry,
      label: String(entry),
      active: entry === result.page,
      href: listResourcePath(basePath, slug, query, { page: entry }, view),
    };
  });

  return {
    page: result.page,
    pageCount: result.pageCount,
    total: result.total,
    formAction: listCollectionPath(basePath, slug, view),
    prevHref:
      result.page > 1
        ? listResourcePath(basePath, slug, query, { page: result.page - 1 }, view)
        : undefined,
    nextHref:
      result.page < result.pageCount
        ? listResourcePath(basePath, slug, query, { page: result.page + 1 }, view)
        : undefined,
    links,
  };
}

export function resolveSortField(
  meta: ResourceMeta,
  query: ListQuery,
  fallback = 'id',
): string {
  const field = query.sort?.trim();
  if (!field) {
    return meta.defaultSort?.field ?? fallback;
  }
  const allowed = new Set(
    meta.columns.filter((column) => column.sortable).map((column) => column.name),
  );
  if (meta.defaultSort?.field) {
    allowed.add(meta.defaultSort.field);
  }
  allowed.add('id');
  allowed.add('createdAt');
  if (!allowed.has(field)) {
    return meta.defaultSort?.field ?? fallback;
  }
  return field;
}

export function resolveSortDirection(
  query: ListQuery,
  meta: ResourceMeta,
): SortDirection {
  if (query.sort?.trim()) {
    return query.direction === 'asc' ? 'asc' : 'desc';
  }
  return meta.defaultSort?.direction ?? 'desc';
}
