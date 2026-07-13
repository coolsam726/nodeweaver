import type { ScaffoldOptions } from '../types.js';

function adminTitle(options: ScaffoldOptions): string {
  const name = options.projectName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return `${name} Admin`;
}

const RESOURCE_LIST =
  'CompanyResource, UserResource, RoleResource, PermissionResource';

export function generateCompanyResource(options: ScaffoldOptions): string | null {
  if (options.orm === 'none') {
    return null;
  }

  const modelImport = modelImportForOrm(options, 'Company');
  const modelRef = modelRefForOrm(options, 'Company');

  return `${modelImport}import { CompanyResourceBase } from '@nestweaver/loom/base';

export class CompanyResource extends CompanyResourceBase {
  static override model = ${modelRef};
}
`;
}

export function generateUserResource(options: ScaffoldOptions): string | null {
  if (options.orm === 'none') {
    return null;
  }

  const modelImport = modelImportForOrm(options, 'User');
  const modelRef = modelRefForOrm(options, 'User');

  return `${modelImport}import { UserResourceBase } from '@nestweaver/loom/base';

export class UserResource extends UserResourceBase {
  static override model = ${modelRef};
}
`;
}

export function generateMongooseCompanySchema(): string {
  return `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Company {
  @Prop({ required: true })
  name!: string;

  @Prop()
  code?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  logo?: string;

  @Prop({ default: true })
  active!: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
`;
}

export function generateMongooseUserSchema(): string {
  return `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class User {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop()
  password?: string;

  @Prop({ type: [String], default: [] })
  roleIds!: string[];

  @Prop({ default: 0 })
  sessionVersion!: number;

  /** Companies this user may switch into when tenancy is enabled */
  @Prop({ type: [String], default: [] })
  companyIds!: string[];

  @Prop({ type: Types.ObjectId, ref: 'Company' })
  companyId?: Types.ObjectId;

  @Prop({ default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
`;
}

export function generateMongooseDatabaseModule(): string {
  return `import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema } from './company.schema';
import { User, UserSchema } from './user.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.DATABASE_URL!),
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
`;
}

export function generateLoomAdminModule(options: ScaffoldOptions): string {
  if (options.orm === 'none') {
    return `import { Module } from '@nestjs/common';
import { LoomModule } from '@nestweaver/loom';

@Module({
  imports: [
    LoomModule.forRoot({
      basePath: '/admin',
      branding: { brandName: '${adminTitle(options)}' },
      resources: [],
    }),
  ],
})
export class LoomAdminModule {}
`;
  }

  const resourcesImport = `import { CompanyResource } from './company.resource';
import { UserResource } from './user.resource';
import { RoleResource } from './role.resource';
import { PermissionResource } from './permission.resource';`;
  const factoryBody = loomFactoryBody(options);
  const extraImports = loomModuleImports(options);

  return `${extraImports}
import { Module } from '@nestjs/common';
import { LoomModule } from '@nestweaver/loom';
${resourcesImport}

@Module({
  imports: [
    LoomModule.forRootAsync({
      basePath: process.env.LOOM_BASE_PATH || '/admin',
      api: { version: 'v1', openapi: true },
      ${loomAsyncImports(options)}
      inject: [${loomInjectTokens(options)}],
      useFactory: ${factoryBody},
    }),
  ],
})
export class LoomAdminModule {}
`;
}

function modelImportForOrm(options: ScaffoldOptions, model: string): string {
  switch (options.orm) {
    case 'typeorm':
      return `import { ${model} } from '../database/${entityFileStem(model)}.entity';\n`;
    case 'mongoose':
      // LoomRole / LoomPermission are registered at runtime by the RBAC store.
      if (model === 'LoomRole' || model === 'LoomPermission') return '';
      return `import { ${model} } from '../database/${entityFileStem(model)}.schema';\n`;
    case 'prisma':
    case 'drizzle':
      return '';
    default:
      return '';
  }
}

function modelRefForOrm(options: ScaffoldOptions, model: string): string {
  switch (options.orm) {
    case 'typeorm':
      return model;
    case 'mongoose':
      if (model === 'LoomRole' || model === 'LoomPermission') return `'${model}'`;
      return model;
    case 'prisma':
      return `'${model}'`;
    case 'drizzle':
      if (model === 'Company') return "'companies'";
      if (model === 'User') return "'users'";
      if (model === 'LoomRole') return "'loomRoles'";
      if (model === 'LoomPermission') return "'loomPermissions'";
      return `'${model.charAt(0).toLowerCase()}${model.slice(1)}s'`;
    default:
      return `'${model}'`;
  }
}

function entityFileStem(model: string): string {
  return model
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function loomModuleImports(options: ScaffoldOptions): string {
  switch (options.orm) {
    case 'typeorm':
      return "import { DataSource } from 'typeorm';";
    case 'prisma':
      return "import { PrismaService } from '../database/prisma.module';";
    case 'drizzle':
      return "import { DRIZZLE } from '../database/drizzle.module';\nimport * as schema from '../database/schema';";
    case 'mongoose':
      return "import { getConnectionToken } from '@nestjs/mongoose';\nimport type { Connection } from 'mongoose';";
    default:
      return '';
  }
}

function loomAsyncImports(options: ScaffoldOptions): string {
  switch (options.orm) {
    case 'typeorm':
      return 'imports: [],';
    case 'prisma':
      return 'imports: [],';
    case 'drizzle':
      return 'imports: [],';
    case 'mongoose':
      return 'imports: [],';
    default:
      return '';
  }
}

function loomInjectTokens(options: ScaffoldOptions): string {
  switch (options.orm) {
    case 'typeorm':
      return 'DataSource';
    case 'prisma':
      return 'PrismaService';
    case 'drizzle':
      return 'DRIZZLE';
    case 'mongoose':
      return 'getConnectionToken()';
    default:
      return '';
  }
}

function loomFactoryBody(options: ScaffoldOptions): string {
  const title = adminTitle(options);
  const authBlock = `auth: {
          secret: process.env.LOOM_AUTH_SECRET || 'dev-loom-auth-secret-change-me',
          secure: process.env.NODE_ENV === 'production',
          seedAdmin: {
            email: process.env.LOOM_ADMIN_EMAIL || 'admin@example.com',
            password: process.env.LOOM_ADMIN_PASSWORD || 'password',
            name: process.env.LOOM_ADMIN_NAME || 'Admin',
            role: 'admin',
          },
        },`;
  const wave4Block = `branding: { brandName: '${title}' },
        securityHeaders: true,
        storage: {
          disk: 'local' as const,
          root: process.env.LOOM_UPLOADS_DIR || './uploads',
          publicUrlPrefix: \`\${process.env.LOOM_BASE_PATH || '/admin'}/media\`,
        },
        audit: {
          onAudit: (event) => {
            // Persist or forward elsewhere in production
            if (process.env.NODE_ENV !== 'production') {
              console.info('[loom.audit]', event.action, event.resource, event.recordId ?? event.recordIds);
            }
          },
        },`;

  switch (options.orm) {
    case 'typeorm':
      return `(dataSource: DataSource) => ({
        orm: 'typeorm' as const,
        dataSource,
        basePath: process.env.LOOM_BASE_PATH || '/admin',
        resources: [${RESOURCE_LIST}],
        ${authBlock}
        ${wave4Block}
      })`;
    case 'prisma':
      return `(prisma: PrismaService) => ({
        orm: 'prisma' as const,
        dataSource: prisma,
        basePath: process.env.LOOM_BASE_PATH || '/admin',
        resources: [${RESOURCE_LIST}],
        ${authBlock}
        ${wave4Block}
      })`;
    case 'drizzle':
      return `(db: unknown) => ({
        orm: 'drizzle' as const,
        dataSource: { db, schema },
        basePath: process.env.LOOM_BASE_PATH || '/admin',
        resources: [${RESOURCE_LIST}],
        ${authBlock}
        ${wave4Block}
      })`;
    case 'mongoose':
      return `(connection: Connection) => ({
        orm: 'mongoose' as const,
        dataSource: connection,
        basePath: process.env.LOOM_BASE_PATH || '/admin',
        resources: [${RESOURCE_LIST}],
        ${authBlock}
        ${wave4Block}
      })`;
    default:
      return '() => ({ resources: [] })';
  }
}

export function generateLoomAdminFiles(
  options: ScaffoldOptions,
): Array<[string, string]> {
  const adminDir = 'apps/api/src/admin';
  const dbDir = 'apps/api/src/database';
  const files: Array<[string, string]> = [
    [`${adminDir}/loom-admin.module.ts`, generateLoomAdminModule(options)],
  ];

  const companyResource = generateCompanyResource(options);
  if (companyResource) {
    files.push([`${adminDir}/company.resource.ts`, companyResource]);
  }

  const userResource = generateUserResource(options);
  if (userResource) {
    files.push([`${adminDir}/user.resource.ts`, userResource]);
  }

  if (options.orm !== 'none') {
    const roleImport = modelImportForOrm(options, 'LoomRole');
    const roleRef = modelRefForOrm(options, 'LoomRole');
    const permissionImport = modelImportForOrm(options, 'LoomPermission');
    const permissionRef = modelRefForOrm(options, 'LoomPermission');
    files.push(
      [
        `${adminDir}/role.resource.ts`,
        `${roleImport}import { RoleResourceBase } from '@nestweaver/loom/base';

export class RoleResource extends RoleResourceBase {
  static override model = ${roleRef};
}
`,
      ],
      [
        `${adminDir}/permission.resource.ts`,
        `${permissionImport}import { PermissionResourceBase } from '@nestweaver/loom/base';

export class PermissionResource extends PermissionResourceBase {
  static override model = ${permissionRef};
}
`,
      ],
    );
  }

  if (options.orm === 'mongoose') {
    files.push(
      [`${dbDir}/company.schema.ts`, generateMongooseCompanySchema()],
      [`${dbDir}/user.schema.ts`, generateMongooseUserSchema()],
      [`${dbDir}/database.module.ts`, generateMongooseDatabaseModule()],
    );
  }

  if (options.orm === 'typeorm') {
    files.push(
      [`${dbDir}/loom-role.entity.ts`, generateTypeormLoomRoleEntity()],
      [
        `${dbDir}/loom-permission.entity.ts`,
        generateTypeormLoomPermissionEntity(),
      ],
    );
  }

  return files;
}

export function generateTypeormLoomRoleEntity(): string {
  return `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('loom_roles')
export class LoomRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  active!: boolean;

  @Column('simple-array', { nullable: true })
  permissionIds?: string[];
}
`;
}

export function generateTypeormLoomPermissionEntity(): string {
  return `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('loom_permissions')
export class LoomPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  resource!: string;

  @Column()
  ability!: string;

  @Column({ nullable: true })
  label?: string;
}
`;
}
