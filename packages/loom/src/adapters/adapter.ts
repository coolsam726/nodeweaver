import type {
  ListQuery,
  OrmKind,
  PaginatedResult,
  ResourceMeta,
} from '../core/types.js';
import { resolveSortDirection, resolveSortField } from '../core/list-query.js';

export interface VelmAdapter {
  readonly kind: OrmKind;
  list(meta: ResourceMeta, query: ListQuery): Promise<PaginatedResult>;
  findOne(meta: ResourceMeta, id: string): Promise<Record<string, unknown>>;
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
}

export interface DrizzleVelmDataSource {
  db: Record<string, unknown>;
  schema: Record<string, unknown>;
}

export function modelKey(meta: ResourceMeta): string {
  if (typeof meta.model === 'string') {
    return meta.model;
  }
  return meta.model.name;
}

export function createNoopAdapter(): VelmAdapter {
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
    create: async () => {
      throw new Error('No ORM configured');
    },
    update: async () => {
      throw new Error('No ORM configured');
    },
    delete: async () => {
      throw new Error('No ORM configured');
    },
  };
}

export function createVelmAdapter(
  kind: OrmKind,
  dataSource: unknown,
): VelmAdapter {
  switch (kind) {
    case 'typeorm':
      return createTypeOrmAdapter(dataSource);
    case 'prisma':
      return createPrismaAdapter(dataSource);
    case 'drizzle':
      return createDrizzleAdapter(dataSource as DrizzleVelmDataSource);
    case 'mongoose':
      return createMongooseAdapter(dataSource);
    default:
      throw new Error(`Unsupported ORM: ${kind satisfies never}`);
  }
}

export function createTypeOrmAdapter(dataSource: unknown): VelmAdapter {
  const source = dataSource as {
    getRepository: (entity: unknown) => TypeOrmRepository;
  };

  return {
    kind: 'typeorm',
    list: (meta, query) => listTypeOrm(source, meta, query),
    findOne: (meta, id) => findOneTypeOrm(source, meta, id),
    create: (meta, data) => createTypeOrm(source, meta, data),
    update: (meta, id, data) => updateTypeOrm(source, meta, id, data),
    delete: (meta, id) => deleteTypeOrm(source, meta, id),
  };
}

export function createPrismaAdapter(client: unknown): VelmAdapter {
  const prisma = client as Record<string, PrismaDelegate>;

  return {
    kind: 'prisma',
    list: (meta, query) => listPrisma(prisma, meta, query),
    findOne: (meta, id) => findOnePrisma(prisma, meta, id),
    create: (meta, data) => createPrisma(prisma, meta, data),
    update: (meta, id, data) => updatePrisma(prisma, meta, id, data),
    delete: (meta, id) => deletePrisma(prisma, meta, id),
  };
}

export function createDrizzleAdapter(dataSource: DrizzleVelmDataSource): VelmAdapter {
  return {
    kind: 'drizzle',
    list: (meta, query) => listDrizzle(dataSource, meta, query),
    findOne: (meta, id) => findOneDrizzle(dataSource, meta, id),
    create: (meta, data) => createDrizzle(dataSource, meta, data),
    update: (meta, id, data) => updateDrizzle(dataSource, meta, id, data),
    delete: (meta, id) => deleteDrizzle(dataSource, meta, id),
  };
}

export function createMongooseAdapter(connection: unknown): VelmAdapter {
  const conn = connection as MongooseConnection;

  return {
    kind: 'mongoose',
    list: (meta, query) => listMongoose(conn, meta, query),
    findOne: (meta, id) => findOneMongoose(conn, meta, id),
    create: (meta, data) => createMongoose(conn, meta, data),
    update: (meta, id, data) => updateMongoose(conn, meta, id, data),
    delete: (meta, id) => deleteMongoose(conn, meta, id),
  };
}

type TypeOrmRepository = {
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
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
};

type MongooseConnection = {
  model: (name: string) => MongooseModel;
};

type MongooseModel = {
  find: (filter: Record<string, unknown>) => MongooseQuery;
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
  const where = await buildTypeOrmSearch(meta, query.search);
  const [items, total] = await repo.findAndCount({
    where,
    order: { [orderField]: direction },
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  });
  return paginate(items.map(normalizeRecord), total, query);
}

async function findOneTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const repo = dataSource.getRepository(meta.model);
  const record = await repo.findOne({ where: { id: coerceId(id) } });
  if (!record) throw new Error('Record not found');
  return normalizeRecord(record);
}

async function createTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const repo = dataSource.getRepository(meta.model);
  const entity = repo.create(data);
  const saved = await repo.save(entity);
  return normalizeRecord(saved);
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
  return normalizeRecord(saved);
}

async function deleteTypeOrm(
  dataSource: { getRepository: (entity: unknown) => TypeOrmRepository },
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const repo = dataSource.getRepository(meta.model);
  const existing = await repo.findOne({ where: { id: coerceId(id) } });
  if (!existing) throw new Error('Record not found');
  await repo.remove(existing);
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
  const where = buildPrismaSearch(meta, query.search);
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
  return paginate(items.map(normalizeRecord), total, query);
}

async function findOnePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown>> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.findUnique({ where: { id: coerceId(id) } });
  if (!record) throw new Error('Record not found');
  return normalizeRecord(record);
}

async function createPrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const delegate = getPrismaDelegate(client, meta);
  const record = await delegate.create({ data });
  return normalizeRecord(record);
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
  return normalizeRecord(record);
}

async function deletePrisma(
  client: Record<string, PrismaDelegate>,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const delegate = getPrismaDelegate(client, meta);
  await delegate.delete({ where: { id: coerceId(id) } });
}

async function listDrizzle(
  dataSource: DrizzleVelmDataSource,
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
  const where = buildDrizzleSearch(drizzle, table, meta, query.search);
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
  return paginate(rows.map(normalizeRecord), total, query);
}

async function findOneDrizzle(
  dataSource: DrizzleVelmDataSource,
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
  return normalizeRecord(record);
}

async function createDrizzle(
  dataSource: DrizzleVelmDataSource,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const queryDb = db as LooseDrizzleDb;
  const rows = (await queryDb.insert(table).values(data).returning()) as unknown[];
  return normalizeRecord(rows[0]);
}

async function updateDrizzle(
  dataSource: DrizzleVelmDataSource,
  meta: ResourceMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  const rows = (await queryDb
    .update(table)
    .set(data)
    .where(drizzle.eq(tableColumns.id, coerceId(id)))
    .returning()) as unknown[];
  return normalizeRecord(rows[0]);
}

async function deleteDrizzle(
  dataSource: DrizzleVelmDataSource,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  const { db, schema } = dataSource;
  const table = resolveDrizzleTable(schema, meta);
  const drizzle = (await import('drizzle-orm')) as DrizzleOperators;
  const queryDb = db as LooseDrizzleDb;
  const tableColumns = table as Record<string, unknown>;
  await queryDb.delete(table).where(drizzle.eq(tableColumns.id, coerceId(id)));
}

async function listMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  query: ListQuery,
): Promise<PaginatedResult> {
  const model = connection.model(modelKey(meta));
  const filter = buildMongoSearch(meta, query.search);
  const sortField = resolveSortField(meta, query, 'createdAt');
  const direction = resolveSortDirection(query, meta) === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.perPage;
  const [items, total] = await Promise.all([
    model.find(filter).sort({ [sortField]: direction }).skip(skip).limit(query.perPage).lean(),
    model.countDocuments(filter),
  ]);
  return paginate(items.map(normalizeRecord), total, query);
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
  return normalizeRecord(record);
}

async function createMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const model = connection.model(modelKey(meta));
  const record = await model.create(data);
  return normalizeRecord(toPlainRecord(record));
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
  return normalizeRecord(toPlainRecord(record));
}

async function deleteMongoose(
  connection: MongooseConnection,
  meta: ResourceMeta,
  id: string,
): Promise<void> {
  assertMongoId(id);
  const model = connection.model(modelKey(meta));
  await model.findByIdAndDelete(id);
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
