import type { OrmKind } from './types.js';
import { relationIdsFromValue } from './relations.js';

export interface LoomPermissionRecord {
  id: string;
  name: string;
  resource: string;
  ability: string;
  label?: string;
}

export interface LoomRoleRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  permissionIds: string[];
}

export interface LoomRbacStore {
  upsertPermission(input: {
    name: string;
    resource: string;
    ability: string;
    label?: string;
  }): Promise<LoomPermissionRecord>;
  findPermissionByName(name: string): Promise<LoomPermissionRecord | null>;
  listPermissions(): Promise<LoomPermissionRecord[]>;
  findRoleBySlug(slug: string): Promise<LoomRoleRecord | null>;
  upsertRole(input: {
    name: string;
    slug: string;
    description?: string;
    permissionIds?: string[];
  }): Promise<LoomRoleRecord>;
  setRolePermissions(roleId: string, permissionIds: string[]): Promise<void>;
  loadPermissionNamesForUser(userId: string, roleIds: string[]): Promise<{
    roles: string[];
    permissions: string[];
  }>;
  assignRoleToUser(userId: string, roleSlug: string): Promise<void>;
}

export const LOOM_RBAC = Symbol('LOOM_RBAC');

export function createNoopRbacStore(): LoomRbacStore {
  const permissions = new Map<string, LoomPermissionRecord>();
  const roles = new Map<string, LoomRoleRecord>();
  const userRoles = new Map<string, string[]>();

  return {
    async upsertPermission(input) {
      const existing = permissions.get(input.name);
      const record: LoomPermissionRecord = {
        id: existing?.id ?? input.name,
        name: input.name,
        resource: input.resource,
        ability: input.ability,
        label: input.label,
      };
      permissions.set(input.name, record);
      return record;
    },
    async findPermissionByName(name) {
      return permissions.get(name) ?? null;
    },
    async listPermissions() {
      return [...permissions.values()];
    },
    async findRoleBySlug(slug) {
      return roles.get(slug) ?? null;
    },
    async upsertRole(input) {
      const existing = roles.get(input.slug);
      const record: LoomRoleRecord = {
        id: existing?.id ?? input.slug,
        name: input.name,
        slug: input.slug,
        description: input.description,
        active: true,
        permissionIds: input.permissionIds ?? existing?.permissionIds ?? [],
      };
      roles.set(input.slug, record);
      return record;
    },
    async setRolePermissions(roleId, permissionIds) {
      for (const role of roles.values()) {
        if (role.id === roleId || role.slug === roleId) {
          role.permissionIds = permissionIds;
          roles.set(role.slug, role);
          return;
        }
      }
    },
    async loadPermissionNamesForUser(userId, roleIds) {
      const slugs: string[] = [];
      const names = new Set<string>();
      for (const role of roles.values()) {
        const match =
          roleIds.includes(role.id) ||
          roleIds.includes(role.slug) ||
          (userRoles.get(userId) ?? []).includes(role.slug);
        if (!match) continue;
        slugs.push(role.slug);
        for (const pid of role.permissionIds) {
          const perm =
            [...permissions.values()].find((p) => p.id === pid || p.name === pid) ??
            permissions.get(pid);
          if (perm) names.add(perm.name);
          else if (pid.includes(':') || pid === '*') names.add(pid);
        }
      }
      return { roles: slugs, permissions: [...names] };
    },
    async assignRoleToUser(userId, roleSlug) {
      const current = userRoles.get(userId) ?? [];
      if (!current.includes(roleSlug)) {
        userRoles.set(userId, [...current, roleSlug]);
      }
    },
  };
}

export function createLoomRbacStore(
  kind: OrmKind,
  dataSource: unknown,
): LoomRbacStore {
  switch (kind) {
    case 'mongoose':
      return createMongooseRbacStore(dataSource);
    case 'typeorm':
      return createTypeOrmRbacStore(dataSource);
    case 'prisma':
      return createPrismaRbacStore(dataSource);
    case 'drizzle':
      return createDrizzleRbacStore(dataSource);
    default:
      return createNoopRbacStore();
  }
}

/* -------------------------------------------------------------------------- */
/* Mongoose                                                                   */
/* -------------------------------------------------------------------------- */

function createMongooseRbacStore(connection: unknown): LoomRbacStore {
  const conn = connection as {
    models: Record<string, unknown>;
    model: (name: string, schema?: unknown) => MongooseModel;
  };

  const Permission = ensureModel(conn, 'LoomPermission', {
    name: { type: String, required: true, unique: true },
    resource: { type: String, required: true },
    ability: { type: String, required: true },
    label: { type: String },
  });

  const Role = ensureModel(conn, 'LoomRole', {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    active: { type: Boolean, default: true },
    permissionIds: [{ type: String }],
  });

  return {
    async upsertPermission(input) {
      const doc = await Permission.findOneAndUpdate(
        { name: input.name },
        {
          name: input.name,
          resource: input.resource,
          ability: input.ability,
          label: input.label ?? humanizePermission(input.name),
        },
        { upsert: true, new: true },
      );
      return toPermission(doc);
    },
    async findPermissionByName(name) {
      const doc = await Permission.findOne({ name }).lean();
      return doc ? toPermission(doc) : null;
    },
    async listPermissions() {
      const docs = await Permission.find({}).lean();
      return docs.map(toPermission);
    },
    async findRoleBySlug(slug) {
      const doc = await Role.findOne({ slug }).lean();
      return doc ? toRole(doc) : null;
    },
    async upsertRole(input) {
      const doc = await Role.findOneAndUpdate(
        { slug: input.slug },
        {
          name: input.name,
          slug: input.slug,
          description: input.description,
          active: true,
          ...(input.permissionIds ? { permissionIds: input.permissionIds } : {}),
        },
        { upsert: true, new: true },
      );
      return toRole(doc);
    },
    async setRolePermissions(roleId, permissionIds) {
      await Role.findOneAndUpdate(
        { $or: [{ _id: roleId }, { slug: roleId }] },
        { permissionIds },
      );
    },
    async loadPermissionNamesForUser(_userId, roleIds) {
      return loadPermissionsFromRoles(
        await Role.find({
          $or: [{ _id: { $in: roleIds } }, { slug: { $in: roleIds } }],
          active: { $ne: false },
        }).lean(),
        async (ids) =>
          Permission.find({
            $or: [{ _id: { $in: ids } }, { name: { $in: ids } }],
          }).lean(),
      );
    },
    async assignRoleToUser(userId, roleSlug) {
      const User = conn.models.User as MongooseModel | undefined;
      if (!User) return;
      const role = await Role.findOne({ slug: roleSlug }).lean();
      if (!role) return;
      const roleId = String(role._id ?? role.slug);
      await User.findByIdAndUpdate(userId, {
        $addToSet: { roleIds: roleId },
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* TypeORM                                                                    */
/* -------------------------------------------------------------------------- */

function createTypeOrmRbacStore(dataSource: unknown): LoomRbacStore {
  const ds = dataSource as {
    getRepository: (target: string) => TypeOrmRepo;
  };

  const permissionRepo = () => ds.getRepository('LoomPermission');
  const roleRepo = () => ds.getRepository('LoomRole');
  const userRepo = () => {
    try {
      return ds.getRepository('User');
    } catch {
      return null;
    }
  };

  return {
    async upsertPermission(input) {
      const repo = permissionRepo();
      let row = await repo.findOne({ where: { name: input.name } });
      if (!row) {
        row = repo.create({
          name: input.name,
          resource: input.resource,
          ability: input.ability,
          label: input.label ?? humanizePermission(input.name),
        });
      } else {
        row.resource = input.resource;
        row.ability = input.ability;
        row.label = input.label ?? humanizePermission(input.name);
      }
      const saved = await repo.save(row);
      return toPermission(saved as Record<string, unknown>);
    },
    async findPermissionByName(name) {
      const row = await permissionRepo().findOne({ where: { name } });
      return row ? toPermission(row as Record<string, unknown>) : null;
    },
    async listPermissions() {
      const rows = await permissionRepo().find();
      return rows.map((row) => toPermission(row as Record<string, unknown>));
    },
    async findRoleBySlug(slug) {
      const row = await roleRepo().findOne({ where: { slug } });
      return row ? toRole(row as Record<string, unknown>) : null;
    },
    async upsertRole(input) {
      const repo = roleRepo();
      let row = await repo.findOne({ where: { slug: input.slug } });
      if (!row) {
        row = repo.create({
          name: input.name,
          slug: input.slug,
          description: input.description,
          active: true,
          permissionIds: input.permissionIds ?? [],
        });
      } else {
        row.name = input.name;
        row.description = input.description;
        row.active = true;
        if (input.permissionIds) row.permissionIds = input.permissionIds;
      }
      const saved = await repo.save(row);
      return toRole(saved as Record<string, unknown>);
    },
    async setRolePermissions(roleId, permissionIds) {
      const repo = roleRepo();
      const row =
        (await repo.findOne({ where: { id: coerceNumericId(roleId) } })) ??
        (await repo.findOne({ where: { slug: roleId } }));
      if (!row) return;
      row.permissionIds = permissionIds;
      await repo.save(row);
    },
    async loadPermissionNamesForUser(_userId, roleIds) {
      if (roleIds.length === 0) return { roles: [], permissions: [] };
      const roles = await roleRepo().find();
      const matched = roles.filter((role) => {
        const id = String((role as Record<string, unknown>).id ?? '');
        const slug = String((role as Record<string, unknown>).slug ?? '');
        const active = (role as Record<string, unknown>).active !== false;
        return active && (roleIds.includes(id) || roleIds.includes(slug));
      });
      return loadPermissionsFromRoles(
        matched as Record<string, unknown>[],
        async (ids) => {
          const all = await permissionRepo().find();
          return all.filter((p) => {
            const rec = p as Record<string, unknown>;
            return ids.includes(String(rec.id)) || ids.includes(String(rec.name));
          }) as Record<string, unknown>[];
        },
      );
    },
    async assignRoleToUser(userId, roleSlug) {
      const users = userRepo();
      if (!users) return;
      const role = await roleRepo().findOne({ where: { slug: roleSlug } });
      if (!role) return;
      const user = await users.findOne({ where: { id: coerceNumericId(userId) } });
      if (!user) return;
      const roleId = String((role as Record<string, unknown>).id);
      const current = relationIdsFromValue((user as Record<string, unknown>).roleIds);
      if (!current.includes(roleId) && !current.includes(roleSlug)) {
        (user as Record<string, unknown>).roleIds = [...current, roleId];
        await users.save(user);
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Prisma                                                                     */
/* -------------------------------------------------------------------------- */

function createPrismaRbacStore(client: unknown): LoomRbacStore {
  const prisma = client as {
    loomPermission?: PrismaDelegate;
    loomRole?: PrismaDelegate;
    user?: PrismaDelegate;
  };

  const Permission = () => requireDelegate(prisma.loomPermission, 'loomPermission');
  const Role = () => requireDelegate(prisma.loomRole, 'loomRole');

  return {
    async upsertPermission(input) {
      const row = await Permission().upsert({
        where: { name: input.name },
        create: {
          name: input.name,
          resource: input.resource,
          ability: input.ability,
          label: input.label ?? humanizePermission(input.name),
        },
        update: {
          resource: input.resource,
          ability: input.ability,
          label: input.label ?? humanizePermission(input.name),
        },
      });
      return toPermission(row);
    },
    async findPermissionByName(name) {
      const row = await Permission().findUnique({ where: { name } });
      return row ? toPermission(row) : null;
    },
    async listPermissions() {
      const rows = await Permission().findMany();
      return rows.map(toPermission);
    },
    async findRoleBySlug(slug) {
      const row = await Role().findUnique({ where: { slug } });
      return row ? toRole(row) : null;
    },
    async upsertRole(input) {
      const existing = await Role().findUnique({ where: { slug: input.slug } });
      const row = await Role().upsert({
        where: { slug: input.slug },
        create: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          active: true,
          permissionIds: input.permissionIds ?? [],
        },
        update: {
          name: input.name,
          description: input.description,
          active: true,
          ...(input.permissionIds
            ? { permissionIds: input.permissionIds }
            : existing
              ? {}
              : { permissionIds: [] }),
        },
      });
      return toRole(row);
    },
    async setRolePermissions(roleId, permissionIds) {
      const byId = await Role().findFirst({
        where: {
          OR: [{ id: coerceNumericId(roleId) }, { slug: roleId }],
        },
      });
      if (!byId) return;
      await Role().update({
        where: { id: byId.id },
        data: { permissionIds },
      });
    },
    async loadPermissionNamesForUser(_userId, roleIds) {
      if (roleIds.length === 0) return { roles: [], permissions: [] };
      const numericIds = roleIds
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n));
      const roles = await Role().findMany({
        where: {
          active: { not: false },
          OR: [
            ...(numericIds.length ? [{ id: { in: numericIds } }] : []),
            { slug: { in: roleIds } },
          ],
        },
      });
      return loadPermissionsFromRoles(roles, async (ids) => {
        const nums = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n));
        return Permission().findMany({
          where: {
            OR: [
              ...(nums.length ? [{ id: { in: nums } }] : []),
              { name: { in: ids } },
            ],
          },
        });
      });
    },
    async assignRoleToUser(userId, roleSlug) {
      if (!prisma.user) return;
      const role = await Role().findUnique({ where: { slug: roleSlug } });
      if (!role) return;
      const user = await prisma.user.findUnique({
        where: { id: coerceNumericId(userId) },
      });
      if (!user) return;
      const current = relationIdsFromValue(user.roleIds);
      const roleId = String(role.id);
      if (current.includes(roleId) || current.includes(roleSlug)) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { roleIds: [...current, roleId] },
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Drizzle                                                                    */
/* -------------------------------------------------------------------------- */

function createDrizzleRbacStore(dataSource: unknown): LoomRbacStore {
  const { db, schema } = dataSource as {
    db: LooseDrizzleDb;
    schema: Record<string, unknown>;
  };

  const permissions = schema.loomPermissions;
  const roles = schema.loomRoles;
  const users = schema.users;
  if (!permissions || !roles) {
    throw new Error(
      'Drizzle schema is missing loomPermissions / loomRoles. ' +
        'Add the ACL tables to your schema and run migrations (pnpm --filter api db:migrate), ' +
        'or pass createNoopRbacStore() explicitly for tests.',
    );
  }

  return {
    async upsertPermission(input) {
      const drizzle = await importDrizzle();
      const existing = await db
        .select()
        .from(permissions)
        .where(drizzle.eq((permissions as Record<string, unknown>).name, input.name))
        .limit(1);
      const label = input.label ?? humanizePermission(input.name);
      if (existing[0]) {
        await db
          .update(permissions)
          .set({
            resource: input.resource,
            ability: input.ability,
            label,
          })
          .where(drizzle.eq((permissions as Record<string, unknown>).name, input.name));
        const rows = await db
          .select()
          .from(permissions)
          .where(drizzle.eq((permissions as Record<string, unknown>).name, input.name))
          .limit(1);
        return toPermission(rows[0] as Record<string, unknown>);
      }
      await db.insert(permissions).values({
        name: input.name,
        resource: input.resource,
        ability: input.ability,
        label,
      });
      const rows = await db
        .select()
        .from(permissions)
        .where(drizzle.eq((permissions as Record<string, unknown>).name, input.name))
        .limit(1);
      return toPermission(
        (rows[0] ?? { name: input.name, resource: input.resource, ability: input.ability, label }) as Record<
          string,
          unknown
        >,
      );
    },
    async findPermissionByName(name) {
      const drizzle = await importDrizzle();
      const rows = await db
        .select()
        .from(permissions)
        .where(drizzle.eq((permissions as Record<string, unknown>).name, name))
        .limit(1);
      return rows[0] ? toPermission(rows[0] as Record<string, unknown>) : null;
    },
    async listPermissions() {
      const rows = await db.select().from(permissions);
      return rows.map((row) => toPermission(row as Record<string, unknown>));
    },
    async findRoleBySlug(slug) {
      const drizzle = await importDrizzle();
      const rows = await db
        .select()
        .from(roles)
        .where(drizzle.eq((roles as Record<string, unknown>).slug, slug))
        .limit(1);
      return rows[0] ? toRole(rows[0] as Record<string, unknown>) : null;
    },
    async upsertRole(input) {
      const drizzle = await importDrizzle();
      const existing = await db
        .select()
        .from(roles)
        .where(drizzle.eq((roles as Record<string, unknown>).slug, input.slug))
        .limit(1);
      const permissionIds = serializeIdList(
        input.permissionIds ??
          (existing[0]
            ? relationIdsFromValue((existing[0] as Record<string, unknown>).permissionIds)
            : []),
      );
      if (existing[0]) {
        await db
          .update(roles)
          .set({
            name: input.name,
            description: input.description,
            active: true,
            ...(input.permissionIds ? { permissionIds } : {}),
          })
          .where(drizzle.eq((roles as Record<string, unknown>).slug, input.slug));
      } else {
        await db.insert(roles).values({
          name: input.name,
          slug: input.slug,
          description: input.description,
          active: true,
          permissionIds,
        });
      }
      const rows = await db
        .select()
        .from(roles)
        .where(drizzle.eq((roles as Record<string, unknown>).slug, input.slug))
        .limit(1);
      return toRole(rows[0] as Record<string, unknown>);
    },
    async setRolePermissions(roleId, permissionIds) {
      const drizzle = await importDrizzle();
      const encoded = serializeIdList(permissionIds);
      const bySlug = await db
        .select()
        .from(roles)
        .where(drizzle.eq((roles as Record<string, unknown>).slug, roleId))
        .limit(1);
      if (bySlug[0]) {
        await db
          .update(roles)
          .set({ permissionIds: encoded })
          .where(drizzle.eq((roles as Record<string, unknown>).slug, roleId));
        return;
      }
      await db
        .update(roles)
        .set({ permissionIds: encoded })
        .where(drizzle.eq((roles as Record<string, unknown>).id, coerceNumericId(roleId)));
    },
    async loadPermissionNamesForUser(_userId, roleIds) {
      if (roleIds.length === 0) return { roles: [], permissions: [] };
      const allRoles = await db.select().from(roles);
      const matched = allRoles.filter((role) => {
        const rec = role as Record<string, unknown>;
        if (rec.active === false) return false;
        return roleIds.includes(String(rec.id)) || roleIds.includes(String(rec.slug));
      }) as Record<string, unknown>[];
      return loadPermissionsFromRoles(matched, async (ids) => {
        const allPerms = await db.select().from(permissions);
        return allPerms.filter((p) => {
          const rec = p as Record<string, unknown>;
          return ids.includes(String(rec.id)) || ids.includes(String(rec.name));
        }) as Record<string, unknown>[];
      });
    },
    async assignRoleToUser(userId, roleSlug) {
      if (!users) return;
      const drizzle = await importDrizzle();
      const roleRows = await db
        .select()
        .from(roles)
        .where(drizzle.eq((roles as Record<string, unknown>).slug, roleSlug))
        .limit(1);
      const role = roleRows[0] as Record<string, unknown> | undefined;
      if (!role) return;
      const userRows = await db
        .select()
        .from(users)
        .where(drizzle.eq((users as Record<string, unknown>).id, coerceNumericId(userId)))
        .limit(1);
      const user = userRows[0] as Record<string, unknown> | undefined;
      if (!user) return;
      const current = relationIdsFromValue(user.roleIds);
      const roleId = String(role.id);
      if (current.includes(roleId) || current.includes(roleSlug)) return;
      await db
        .update(users)
        .set({ roleIds: serializeIdList([...current, roleId]) })
        .where(drizzle.eq((users as Record<string, unknown>).id, coerceNumericId(userId)));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

type MongooseModel = {
  findOne: (filter: Record<string, unknown>) => {
    lean: () => Promise<Record<string, unknown> | null>;
  };
  find: (filter: Record<string, unknown>) => {
    lean: () => Promise<Record<string, unknown>[]>;
  };
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  findByIdAndUpdate: (id: string, update: Record<string, unknown>) => Promise<unknown>;
};

type TypeOrmRepo = {
  find: (options?: Record<string, unknown>) => Promise<unknown[]>;
  findOne: (options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (data: Record<string, unknown>) => Record<string, unknown>;
  save: (entity: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type PrismaDelegate = {
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  findMany: (args?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type LooseDrizzleDb = {
  select: () => {
    from: (table: unknown) => {
      where: (clause: unknown) => {
        limit: (n: number) => Promise<unknown[]>;
      } & Promise<unknown[]>;
    } & Promise<unknown[]>;
  };
  insert: (table: unknown) => {
    values: (data: Record<string, unknown>) => {
      returning: () => Promise<unknown[]>;
    } & Promise<unknown>;
  };
  update: (table: unknown) => {
    set: (data: Record<string, unknown>) => {
      where: (clause: unknown) => Promise<unknown>;
    };
  };
};

function ensureModel(
  conn: {
    models: Record<string, unknown>;
    model: (name: string, schema?: unknown) => MongooseModel;
  },
  name: string,
  definition: Record<string, unknown>,
): MongooseModel {
  if (conn.models[name]) {
    return conn.models[name] as MongooseModel;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongoose = require('mongoose') as {
    Schema: new (def: Record<string, unknown>) => unknown;
  };
  const schema = new mongoose.Schema(definition);
  return conn.model(name, schema);
}

function requireDelegate(
  delegate: PrismaDelegate | undefined,
  name: string,
): PrismaDelegate {
  if (!delegate) {
    throw new Error(
      `Prisma model "${name}" is missing. Add LoomRole / LoomPermission to your schema.`,
    );
  }
  return delegate;
}

async function importDrizzle(): Promise<{
  eq: (left: unknown, right: unknown) => unknown;
}> {
  return (await import('drizzle-orm')) as {
    eq: (left: unknown, right: unknown) => unknown;
  };
}

async function loadPermissionsFromRoles(
  roleDocs: Record<string, unknown>[],
  loadPermissions: (ids: string[]) => Promise<Record<string, unknown>[]>,
): Promise<{ roles: string[]; permissions: string[] }> {
  const permissionIdSet = new Set<string>();
  const slugs: string[] = [];
  for (const role of roleDocs) {
    slugs.push(String(role.slug));
    for (const id of relationIdsFromValue(role.permissionIds)) {
      permissionIdSet.add(id);
    }
  }
  const ids = [...permissionIdSet];
  const permDocs = ids.length > 0 ? await loadPermissions(ids) : [];
  const permissions = [...new Set(permDocs.map((p) => String(p.name)))];
  for (const id of ids) {
    if (id.includes(':') || id === '*') permissions.push(id);
  }
  return { roles: slugs, permissions: [...new Set(permissions)] };
}

function toPermission(doc: Record<string, unknown>): LoomPermissionRecord {
  return {
    id: String(doc.id ?? doc._id ?? ''),
    name: String(doc.name),
    resource: String(doc.resource ?? ''),
    ability: String(doc.ability ?? ''),
    label: doc.label != null ? String(doc.label) : undefined,
  };
}

function toRole(doc: Record<string, unknown>): LoomRoleRecord {
  return {
    id: String(doc.id ?? doc._id ?? ''),
    name: String(doc.name),
    slug: String(doc.slug),
    description: doc.description != null ? String(doc.description) : undefined,
    active: doc.active !== false,
    permissionIds: relationIdsFromValue(doc.permissionIds),
  };
}

function humanizePermission(name: string): string {
  if (name === '*') return 'All permissions';
  const [resource, ability] = name.split(':');
  if (!ability) return name;
  if (ability === '*') return `All ${resource} actions`;
  return `${ability} ${resource}`;
}

function coerceNumericId(id: string): string | number {
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

/** Persist id lists for Drizzle text/json columns. */
function serializeIdList(ids: string[]): string {
  return JSON.stringify(ids);
}
