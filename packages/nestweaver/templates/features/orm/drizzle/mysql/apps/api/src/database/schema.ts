import { boolean, int, mysqlTable, serial, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const companies = mysqlTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 255 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }),
  roleIds: text('role_ids'),
  sessionVersion: int('session_version').notNull().default(0),
  companyId: int('company_id').references(() => companies.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const loomPermissions = mysqlTable('loom_permissions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  resource: varchar('resource', { length: 255 }).notNull(),
  ability: varchar('ability', { length: 255 }).notNull(),
  label: varchar('label', { length: 255 }),
});

export const loomRoles = mysqlTable('loom_roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  permissionIds: text('permission_ids'),
});
