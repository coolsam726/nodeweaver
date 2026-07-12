import type {
  ListQuery,
  OrmKind,
  PaginatedResult,
  ResourceMeta,
} from '../core/types.js';
import { withDisplayNameFromMeta } from '../core/display-name.js';
import { resolveSortDirection, resolveSortField } from '../core/list-query.js';
import {
  softDeleteClear,
  softDeleteField,
  softDeleteStamp,
} from '../core/soft-delete.js';

export interface LoomAdapter {
  readonly kind: OrmKind;
  list(meta: ResourceMeta, query: ListQuery): Promise<PaginatedResult>;
  findOne(meta: ResourceMeta, id: string): Promise<Record<string, unknown>>;
  findManyByIds(meta: ResourceMeta, ids: string[]): Promise<Record<string, unknown>[]>;
  /** Exact equality match on one or more fields; returns null when not found */
  findFirst(
    meta: ResourceMeta,
    where: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
  create(
    meta: ResourceMeta,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  update(
    meta: ResourceMeta,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  delete(meta: ResourceMeta, id: string): Promise<void>;
  /** Clear soft-delete marker when resource enables softDelete */
  restore?(meta: ResourceMeta, id: string): Promise<Record<string, unknown>>;
}

export interface DrizzleLoomDataSource {
  db: Record<string, unknown>;
  schema: Record<string, unknown>;
}

export function modelKey(meta: ResourceMeta): string {
  if (typeof meta.model === 'string') {
    return meta.model;
  }
  return meta.model.name;
}

export function createNoopAdapter(): LoomAdapter {
  const emptyPage = {
    items: [] as Record<string, unknown>[],
    total: 0,
    page: 1,
    perPage: 15,
    pageCount: 1,
  };

  return {
    kind: 'typeorm',
    list: async () => emptyPage,
    findOne: async () => {
      throw new Error('No ORM configured');
    },
    findManyByIds: async () => [],
    findFirst: async () => null,
    create: async () => {
      throw new Error('No ORM configured');
    },
    update: async () => {
      throw new Error('No ORM configured');
    },
    delete: async () => {
      throw new Error('No ORM configured');
    },
    restore: async () => {
      throw new Error('No ORM configured');
    },
  };
}

export function createLoomAdapter(
  kind: OrmKind,
  dataSource: unknown,
): LoomAdapter {
  switch (kind) {
    case 'typeorm':
      return createTypeOrmAdapter(dataSource);
    case 'prisma':
      return createPrismaAdapter(dataSource);
    case 'drizzle':
      return createDrizzleAdapter(dataSource as DrizzleLoomDataSource);
    case 'mongoose':
      return createMongooseAdapter(dataSource);
    default:
      throw new Error(`Unsupported ORM: ${kind satisfies never}`);
  }
}

export function createTypeOrmAdapter(dataSource: unknown): LoomAdapter {
  const source = dataSource as {
    getRepository: (entity: unknown) => TypeOrmRepository;
  };

  return {
    kind: 'typeorm',
    list: (meta, query) => listTypeOrm(source, meta, query),
    findOne: (meta, id) => findOneTypeOrm(source, meta, id),
    findManyByIds: (meta, ids) => findManyByIdsTypeOrm(source, meta, ids),
    findFirst: (meta, where) => findFirstTypeOrm(source, meta, where),
    create: (meta, data) => createTypeOrm(source, meta, data),
    update: (meta, id, data) => updateTypeOrm(source, meta, id, data),
    delete: (meta, id) => deleteTypeOrm(source, meta, id),
    restore: (meta, id) => restoreTypeOrm(source, meta, id),
  };
}

export function createPrismaAdapter(client: unknown): LoomAdapter {
  const prisma = client as Record<string, PrismaDelegate>;

  return {
    kind: 'prisma',
    list: (meta, query) => listPrisma(prisma, meta, query),
    findOne: (meta, id) => findOnePrisma(prisma, meta, id),
    findManyByIds: (meta, ids) => findManyByIdsPrisma(prisma, meta, ids),
    findFirst: (meta, where) => findFirstPrisma(prisma, meta, where),
    create: (meta, data) => createPrisma(prisma, meta, data),
    update: (meta, id, data) => updatePrisma(prisma, meta, id, data),
    delete: (meta, id) => deletePrisma(prisma, meta, id),
    restore: (meta, id) => restorePrisma(prisma, meta, id),
  };
}

export function createDrizzleAdapter(dataSource: DrizzleLoomDataSource): LoomAdapter {
  return {
    kind: 'drizzle',
    list: (meta, query) => listDrizzle(dataSource, meta, query),
    findOne: (meta, id) => findOneDrizzle(dataSource, meta, id),
    findManyByIds: (meta, ids) => findManyByIdsDrizzle(dataSource, meta, ids),
    findFirst: (meta, where) => findFirstDrizzle(dataSource, meta, where),
    create: (meta, data) => createDrizzle(dataSource, meta, data),
    update: (meta, id, data) => updateDrizzle(dataSource, meta, id, data),
    delete: (meta, id) => deleteDrizzle(dataSource, meta, id),
    restore: (meta, id) => restoreDrizzle(dataSource, meta, id),
  };
}

export function createMongooseAdapter(connection: unknown): LoomAdapter {
  const conn = connection as MongooseConnection;

  return {
    kind: 'mongoose',
    list: (meta, query) => listMongoose(conn, meta, query),
    findOne: (meta, id) => findOneMongoose(conn, meta, id),
    findManyByIds: (meta, ids) => findManyByIdsMongoose(conn, meta, ids),
    findFirst: (meta, where) => findFirstMongoose(conn, meta, where),
    create: (meta, data) => createMongoose(conn, meta, data),
    update: (meta, id, data) => updateMongoose(conn, meta, id, data),
    delete: (meta, id) => deleteMongoose(conn, meta, id),
    restore: (meta, id) => restoreMongoose(conn, meta, id),
  };
}

type TypeOrmRepository = {
  find: (options: Record<string, unknown>) => Promise<unknown[]>;
  findAndCount: (options: Record<string, unknown>) => Promise<[unknown[], number]>;
  findOne: (options: Record<string, unknown>) => Promise<unknown>;
  create: (data: Record<string, unknown>) => unknown;
  save: (entity: unknown) => Promise<unknown>;
  remove: (entity: unknown) => Promise<unknown>;
};

type PrismaDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst: (args: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
};

type MongooseConnection = {
  model: (name: string) => MongooseModel;
};

type MongooseModel = {
  find: (filter: Record<string, unknown>) => MongooseQuery;
  findOne: (filter: Record<string, unknown>) => { lean: () => Promise<unknown> };
  countDocuments: (filter: Record<string, unknown>) => Promise<number>;
  findById: (id: string) => { lean: () => Promise<unknown> };
  create: (data: Record<string, unknown>) => Promise<unknown>;
  findByIdAndUpdate: (
    id: string,
    data: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  findByIdAndDelete: (id: string) => Promise<unknown>;
};

type MongooseQuery = {
  sort: (value: Record<string, number>) => {
    skip: (value: number) => {
      limit: (value: number) => { lean: () => Promise<unknown[]> };
    };
  };
  lean: () => Promise<unknown[]>;
};

type DrizzleOperators = {
  asc: (column: unknown) => unknown;
  desc: (column: unknown) => unknown;
  eq: (left: unknown, right: unknown) => unknown;
  like: (left: unknown, right: string) => unknown;
  or: (...conditions: unknown[]) => unknown;
  count: () => unknown;
};

type LooseDrizzleDb = {
  select: (shape?: unknown) => {
    from: (table: unknown) => {
      where: (clause: unknown) => {
        orderBy: (order: unknown) => {
          limit: (count: number) => {
            offset: (count: number) => Promise<unknown[]>;
          };
        };
        limit: (count: number) => Promise<unknown[]>;
      } & Promise<unknown[]>;
    };
  };
  insert: (table: unknown) => {
    values: (data: Record<string, unknown>) => {
      returning: () => Promise<unknown[]>;
    };
  };
  update: (table: unknown) => {
    set: (data: Record<string, unknown>) => {
      where: (clause: unknown) => {
        returning: () => Promise<unknown[]>;
      };
    };
  };
  delete: (table: unknown) => {
    where: (clause: unknown) => Promise<unknown>;
  };
};

async function listTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  query: ListQuery,
): Promise<PaginatedResult> {
  const repo = dataSource.getRepository(meta.model);
  const orderField = resolveSortField(meta, query);
  const direction = resolveSortDirection(query, meta).toUpperCase();
  const soft = await typeOrmSoftDeleteWhere(meta, query);
  const where = mergeTypeOrmWhere(
    await buildTypeOrmSearch(meta, query.search),
    { ...(query.scope?.equals ?? {}), ...soft },
  );
  const [items, total] = await repo.findAndCount({
    where,
    order: { [orderField]: direction },
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  });
  return paginate(items.map((item) => finalizeRecord(meta, item)), total, query);
}

async function findOneTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const repo = dataSource.getRepository(meta.model);
  const record = await repo.findOne({ where: { id: coerceId(id) } });
  if (!record) throw new Error('Record not found');
  return finalizeRecord(meta, record);
}

async function findFirstTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  where: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const repo = dataSource.getRepository(meta.model);
  const record = await repo.findOne({ where: coerceWhere(where) });
  if (!record) return null;
  return finalizeRecord(meta, record);
}

async function findManyByIdsTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const repo = dataSource.getRepository(meta.model);
  try {
    const { In } = await import('typeorm');
    const records = await repo.find({
      where: { id: In(ids.map(coerceId)) },
    });
    return records.map((item) => finalizeRecord(meta, item));
  } catch {
    const records = await repo.find({
      where: ids.map((id) => ({ id: coerceId(id) })),
    });
    return records.map((item) => finalizeRecord(meta, item));
  }
}

async function createTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const repo = dataSource.getRepository(meta.model);
  const entity = repo.create(data);
  const saved = await repo.save(entity);
  return finalizeRecord(meta, saved);
}

async function updateTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const repo = dataSource.getRepository(meta.model);
  const existing = await repo.findOne({ where: { id: coerceId(id) } });
  if (!existing) throw new Error('Record not found');
  Object.assign(existing as object, data);
  const saved = await repo.save(existing);
  return finalizeRecord(meta, saved);
}

async function deleteTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const stamp = softDeleteStamp(meta);
  if (stamp) {
    await updateTypeOrm(dataSource, meta, id, stamp);
    return;
  }
  const repo = dataSource.getRepository(meta.model);
  const existing = await repo.findOne({ where: { id: coerceId(id) } });
  if (!existing) throw new Error('Record not found');
  await repo.remove(existing);
}

async function restoreTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const clear = softDeleteClear(meta);
  if (!clear) throw new Error('Soft delete is not enabled for this resource');
  return updateTypeOrm(dataSource, meta, id, clear);
}

async function typeOrmSoftDeleteWhere(
  meta: ResourceMeta,
  query: ListQuery,
): Promise<Record<string, unknown>> {
  const field = softDeleteField(meta);
  if (!field || query.trashed === 'with') return {};
  try {
    const { IsNull, Not } = await import('typeorm');
    if (query.trashed === 'only' || query.trashed === true) {
      return { [field]: Not(IsNull()) };
    }
    return { [field]: IsNull() };
  } catch {
    if (query.trashed === 'only' || query.trashed === true) {
      return { [field]: { $loomTrashed: true } };
    }
    return { [field]: null };
  }
}

async function buildTypeOrmSearch(
  meta: ResourceMeta,
  search?: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (!search?.trim() || meta.searchableFields.length === 0) {
    return {};
  }
  try {
    const { ILike } = await import('typeorm');
    return meta.searchableFields.map((field) => ({
      [field]: ILike(`%${search}%`),
    }));
  } catch {
    return meta.searchableFields.map((field) => ({
      [field]: `%${search}%`,
    }));
  }
}

async function listPrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  query: ListQuery,
): Promise<PaginatedResult> {
  const delegate = getPrismaDelegate(client, meta);
  const soft = prismaSoftDeleteWhere(meta, query);
  const where = mergePrismaWhere(buildPrismaSearch(meta, query.search), {
    ...(query.scope?.equals ?? {}),
    ...soft,
  });
  const orderField = resolveSortField(meta, query);
  const direction = resolveSortDirection(query, meta);
  const skip = (query.page - 1) * query.perPage;
  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: { [orderField]: direction },
      skip,
      take: query.perPage,
    }),
    delegate.count({ where }),
  ]);
  return paginate(items.map((item) => finalizeRecord(meta, item)), total, query);
}

async function findOnePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.findUnique({ where: { id: coerceId(id) } });
  if (!record) throw new Error('Record not found');
  return finalizeRecord(meta, record);
}

async function findFirstPrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  where: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.findFirst({ where: coerceWhere(where) });
  if (!record) return null;
  return finalizeRecord(meta, record);
}

async function findManyByIdsPrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const delegate = getPrismaDelegate(client, meta);
  const records = await delegate.findMany({
    where: { id: { in: ids.map(coerceId) } },
  });
  return records.map((item) => finalizeRecord(meta, item));
}

async function createPrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.create({ data });
  return finalizeRecord(meta, record);
}

async function updatePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.update({
    where: { id: coerceId(id) },
    data,
  });
  return finalizeRecord(meta, record);
}

async function deletePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const stamp = softDeleteStamp(meta);
  if (stamp) {
    await updatePrisma(client, meta, id, stamp);
    return;
  }
  const delegate = getPrismaDelegate(client, meta);
  await delegate.delete({ where: { id: coerceId(id) } });
}

async function restorePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const clear = softDeleteClear(meta);
  if (!clear) throw new Error('Soft delete is not enabled for this resource');
  return updatePrisma(client, meta, id, clear);
}

function prismaSoftDeleteWhere(
  meta: ResourceMeta,
  query: ListQuery,
): Record<string, unknown> {
  const field = softDeleteField(meta);
  if (!field || query.trashed === 'with') return {};
  if (query.trashed === 'only' || query.trashed === true) {
    return { [field]: { not: null } };
  }
  return { [field]: null };
}

async function listDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  query: ListQuery,
): Promise<PaginatedResult> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const orderField = resolveSortField(meta, query);
  const direction = resolveSortDirection(query, meta);
  const orderBy =
    direction === 'asc'
      ? drizzle.asc(tableColumns[orderField])
      : drizzle.desc(tableColumns[orderField]);
  const searchWhere = buildDrizzleSearch(drizzle, table, meta, query.search);
  const scopeEquals = query.scope?.equals ?? {};
  const scopeClauses = Object.entries(scopeEquals).map(([key, value]) =>
    drizzle.eq(tableColumns[key], value),
  );
  const softField = softDeleteField(meta);
  if (softField && query.trashed !== 'with') {
    const col = tableColumns[softField];
    if (col) {
      if (query.trashed === 'only' || query.trashed === true) {
        const isNotNull = (drizzle as { isNotNull?: (c: unknown) => unknown }).isNotNull;
        if (isNotNull) scopeClauses.push(isNotNull(col));
      } else {
        const isNull = (drizzle as { isNull?: (c: unknown) => unknown }).isNull;
        if (isNull) scopeClauses.push(isNull(col));
        else scopeClauses.push(drizzle.eq(col, null));
      }
    }
  }
  const drizzleAnd = drizzle as DrizzleOperators & {
    and: (...conditions: unknown[]) => unknown;
  };
  const parts = [searchWhere, ...scopeClauses].filter((p) => p != null);
  const where =
    parts.length === 0
      ? undefined
      : parts.length === 1
        ? parts[0]
        : drizzleAnd.and(...parts);
  const rows = (await queryDb
    .select()
    .from(table)
    .where(where)
    .orderBy(orderBy)
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage)) as unknown[];
  const countRows = (await queryDb
    .select({ count: drizzle.count() })
    .from(table)
    .where(where)) as Array<{ count?: number }>;
  const total = Number(countRows[0]?.count ?? 0);
  return paginate(rows.map((item) => finalizeRecord(meta, item)), total, query);
}

async function findOneDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const rows = (await queryDb
    .select()
    .from(table)
    .where(drizzle.eq(tableColumns.id, coerceId(id)))
    .limit(1)) as unknown[];
  const record = rows[0];
  if (!record) throw new Error('Record not found');
  return finalizeRecord(meta, record);
}

async function findFirstDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  where: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators & {
    and: (...conditions: unknown[]) => unknown;
  };
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const coerced = coerceWhere(where);
  const conditions = Object.entries(coerced).map(([key, value]) =>
    drizzle.eq(tableColumns[key], value),
  );
  if (conditions.length === 0) return null;
  const clause = conditions.length === 1 ? conditions[0] : drizzle.and(...conditions);
  const rows = (await queryDb.select().from(table).where(clause).limit(1)) as unknown[];
  const record = rows[0];
  if (!record) return null;
  return finalizeRecord(meta, record);
}

async function findManyByIdsDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators & {
    inArray: (left: unknown, right: unknown[]) => unknown;
  };
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const rows = (await queryDb
    .select()
    .from(table)
    .where(drizzle.inArray(tableColumns.id, ids.map(coerceId)))) as unknown[];
  return rows.map((item) => finalizeRecord(meta, item));
}

async function createDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const queryDb = db as LooseDrizzleDb;
  const encoded = encodeDrizzleWriteData(data);
  let row: unknown;
  try {
    const rows = (await queryDb.insert(table).values(encoded).returning()) as unknown[];
    row = rows[0];
  } catch {
    await queryDb.insert(table).values(encoded);
  }
  if (!row) {
    const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
    const tableColumns = table as Record<string, unknown>;
    if (encoded.email != null && tableColumns.email) {
      const found = (await queryDb
        .select()
        .from(table)
        .where(drizzle.eq(tableColumns.email, encoded.email))
        .limit(1)) as unknown[];
      row = found[0];
    } else if (encoded.slug != null && tableColumns.slug) {
      const found = (await queryDb
        .select()
        .from(table)
        .where(drizzle.eq(tableColumns.slug, encoded.slug))
        .limit(1)) as unknown[];
      row = found[0];
    } else if (encoded.name != null && tableColumns.name) {
      const found = (await queryDb
        .select()
        .from(table)
        .where(drizzle.eq(tableColumns.name, encoded.name))
        .limit(1)) as unknown[];
      row = found[0];
    }
  }
  return finalizeRecord(meta, row ?? encoded);
}

async function updateDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const encoded = encodeDrizzleWriteData(data);
  let row: unknown;
  try {
    const rows = (await queryDb
      .update(table)
      .set(encoded)
      .where(drizzle.eq(tableColumns.id, coerceId(id)))
      .returning()) as unknown[];
    row = rows[0];
  } catch {
    await queryDb
      .update(table)
      .set(encoded)
      .where(drizzle.eq(tableColumns.id, coerceId(id)));
  }
  if (!row) {
    const found = (await queryDb
      .select()
      .from(table)
      .where(drizzle.eq(tableColumns.id, coerceId(id)))
      .limit(1)) as unknown[];
    row = found[0];
  }
  return finalizeRecord(meta, row);
}

async function deleteDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const stamp = softDeleteStamp(meta);
  if (stamp) {
    await updateDrizzle(dataSource, meta, id, stamp);
    return;
  }
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  await queryDb.delete(table).where(drizzle.eq(tableColumns.id, coerceId(id)));
}

async function restoreDrizzle(
  dataSource: DrizzleLoomDataSource,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const clear = softDeleteClear(meta);
  if (!clear) throw new Error('Soft delete is not enabled for this resource');
  return updateDrizzle(dataSource, meta, id, clear);
}

async function listMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  query: ListQuery,
): Promise<PaginatedResult> {
  const model = connection.model(modelKey(meta));
  const parts: Record<string, unknown>[] = [];
  const search = buildMongoSearch(meta, query.search);
  if (Object.keys(search).length > 0) parts.push(search);
  if (query.scope?.equals && Object.keys(query.scope.equals).length > 0) {
    parts.push({ ...query.scope.equals });
  }
  const soft = mongooseSoftDeleteWhere(meta, query);
  if (Object.keys(soft).length > 0) parts.push(soft);
  const filter =
    parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { $and: parts };
  const sortField = resolveSortField(meta, query, 'createdAt');
  const direction = resolveSortDirection(query, meta) === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.perPage;
  const [items, total] = await Promise.all([
    model.find(filter).sort({ [sortField]: direction }).skip(skip).limit(query.perPage).lean(),
    model.countDocuments(filter),
  ]);
  return paginate(items.map((item) => finalizeRecord(meta, item)), total, query);
}

async function findOneMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  assertMongoId(id);
  const model = connection.model(modelKey(meta));
  const record = await model.findById(id).lean();
  if (!record) throw new Error('Record not found');
  return finalizeRecord(meta, record);
}

async function findFirstMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  where: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const model = connection.model(modelKey(meta));
  const record = await model.findOne(coerceWhere(where)).lean();
  if (!record) return null;
  return finalizeRecord(meta, record);
}

async function findManyByIdsMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const mongoIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
  if (mongoIds.length === 0) return [];
  const model = connection.model(modelKey(meta));
  const items = await model.find({ _id: { $in: mongoIds } }).lean();
  return items.map((item) => finalizeRecord(meta, item));
}

async function createMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const model = connection.model(modelKey(meta));
  const record = await model.create(data);
  return finalizeRecord(meta, toPlainRecord(record));
}

async function updateMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertMongoId(id);
  const model = connection.model(modelKey(meta));
  const record = await model.findByIdAndUpdate(id, data, { new: true });
  if (!record) throw new Error('Record not found');
  return finalizeRecord(meta, toPlainRecord(record));
}

async function deleteMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  assertMongoId(id);
  const stamp = softDeleteStamp(meta);
  if (stamp) {
    await updateMongoose(connection, meta, id, stamp);
    return;
  }
  const model = connection.model(modelKey(meta));
  await model.findByIdAndDelete(id);
}

async function restoreMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const clear = softDeleteClear(meta);
  if (!clear) throw new Error('Soft delete is not enabled for this resource');
  return updateMongoose(connection, meta, id, clear);
}

function mongooseSoftDeleteWhere(
  meta: ResourceMeta,
  query: ListQuery,
): Record<string, unknown> {
  const field = softDeleteField(meta);
  if (!field || query.trashed === 'with') return {};
  if (query.trashed === 'only' || query.trashed === true) {
    return { [field]: { $ne: null } };
  }
  return {
    $or: [{ [field]: null }, { [field]: { $exists: false } }],
  };
}

function paginate<T>(
  items: T[],
  total: number,
  query: ListQuery,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: query.page,
    perPage: query.perPage,
    pageCount: Math.max(1, Math.ceil(total / query.perPage)),
  };
}

function coerceId(id: string): string | number {
  const asNumber = Number(id);
  return Number.isNaN(asNumber) ? id : asNumber;
}

function assertMongoId(id: string): void {
  if (!id?.trim() || !/^[a-f\d]{24}$/i.test(id)) {
    throw new Error('Record not found');
  }
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record = value as {
    toObject?: () => Record<string, unknown>;
    toJSON?: () => Record<string, unknown>;
  };
  if (typeof record.toObject === 'function') {
    return record.toObject();
  }
  if (typeof record.toJSON === 'function') {
    return record.toJSON() as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function serializeValue(entry: unknown): unknown {
  if (entry instanceof Date) {
    return entry.toISOString();
  }
  if (entry && typeof entry === 'object') {
    const bson = entry as { _bsontype?: string; toHexString?: () => string };
    if (bson._bsontype === 'ObjectId' || bson._bsontype === 'ObjectID') {
      return bson.toHexString?.() ?? String(entry);
    }
  }
  return entry;
}

export function recordIdFrom(value: Record<string, unknown>): string {
  const id = value.id ?? value._id;
  if (id === undefined || id === null || id === '') {
    return '';
  }
  return String(id);
}

function coerceWhere(where: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (key === 'id' || key === '_id') {
      out[key] = coerceId(String(value));
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  const plain = toPlainRecord(value);
  if (Object.keys(plain).length === 0 && (!value || typeof value !== 'object')) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(plain)) {
    out[key] = serializeValue(entry);
  }
  if (out._id !== undefined && (out.id === undefined || out.id === '')) {
    out.id = String(out._id);
  }
  return out;
}

function finalizeRecord(meta: ResourceMeta, value: unknown): Record<string, unknown> {
  return withDisplayNameFromMeta(normalizeRecord(value), meta);
}

/** Drizzle scaffolds store id-lists in text columns as JSON. */
function encodeDrizzleWriteData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      out[key] = JSON.stringify(value.map((item) => String(item)));
    } else {
      out[key] = value;
    }
  }
  return out;
}

function getPrismaDelegate(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
): PrismaDelegate {
  const key = modelKey(meta);
  const camel = key.charAt(0).toLowerCase() + key.slice(1);
  const delegate = client[camel];
  if (!delegate) {
    throw new Error(`Prisma delegate not found for model "${key}" (expected client.${camel})`);
  }
  return delegate;
}

function resolveDrizzleTable(
  schema: Record<string, unknown>,
  meta: ResourceMeta,
): unknown {
  if (typeof meta.model !== 'string') {
    return meta.model;
  }
  const table = schema[meta.model];
  if (!table) {
    throw new Error(`Drizzle table "${meta.model}" not found in schema`);
  }
  return table;
}

function buildPrismaSearch(meta: ResourceMeta, search?: string) {
  if (!search?.trim() || meta.searchableFields.length === 0) return {};
  return {
    OR: meta.searchableFields.map((field) => ({
      [field]: { contains: search, mode: 'insensitive' },
    })),
  };
}

function buildDrizzleSearch(
  drizzle: DrizzleOperators,
  table: unknown,
  meta: ResourceMeta,
  search?: string,
) {
  if (!search?.trim() || meta.searchableFields.length === 0) {
    return undefined;
  }
  const columns = table as Record<string, unknown>;
  const clauses = meta.searchableFields.map((field) =>
    drizzle.like(columns[field], `%${search}%`),
  );
  return drizzle.or(...clauses);
}

function buildMongoSearch(meta: ResourceMeta, search?: string) {
  if (!search?.trim() || meta.searchableFields.length === 0) return {};
  return {
    $or: meta.searchableFields.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    })),
  };
}

function mergeTypeOrmWhere(
  search: Record<string, unknown> | Record<string, unknown>[],
  scope?: Record<string, unknown>,
): Record<string, unknown> | Record<string, unknown>[] {
  const scoped = coerceWhere(scope ?? {});
  if (!scope || Object.keys(scoped).length === 0) return search;
  if (Array.isArray(search)) {
    if (search.length === 0) return scoped;
    return search.map((clause) => ({ ...clause, ...scoped }));
  }
  return { ...search, ...scoped };
}

function mergePrismaWhere(
  search: Record<string, unknown>,
  scope?: Record<string, unknown>,
): Record<string, unknown> {
  const scoped = coerceWhere(scope ?? {});
  if (!scope || Object.keys(scoped).length === 0) return search;
  if (Object.keys(search).length === 0) return scoped;
  return { AND: [search, scoped] };
}
