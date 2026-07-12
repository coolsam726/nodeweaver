import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  email: text('email'),
  phone: text('phone'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password'),
  roleIds: text('role_ids'),
  sessionVersion: integer('session_version').notNull().default(0),
  companyId: integer('company_id').references(() => companies.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const loomPermissions = pgTable('loom_permissions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  resource: text('resource').notNull(),
  ability: text('ability').notNull(),
  label: text('label'),
});

export const loomRoles = pgTable('loom_roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  permissionIds: text('permission_ids'),
});
