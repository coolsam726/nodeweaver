import type { ScaffoldOptions } from '../types.js';

function adminTitle(options: ScaffoldOptions): string {
  const name = options.projectName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return `${name} Admin`;
}

const RESOURCE_LIST = 'CompanyResource, UserResource';

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
      title: '${adminTitle(options)}',
      resources: [],
    }),
  ],
})
export class LoomAdminModule {}
`;
  }

  const resourcesImport = `import { CompanyResource } from './company.resource';
import { UserResource } from './user.resource';`;
  const factoryBody = loomFactoryBody(options);
  const extraImports = loomModuleImports(options);

  return `${extraImports}
import { Module } from '@nestjs/common';
import { LoomModule } from '@nestweaver/loom';
${resourcesImport}

@Module({
  imports: [
    LoomModule.forRootAsync({
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
      return `import { ${model} } from '../database/${model.toLowerCase()}.entity';\n`;
    case 'mongoose':
      return `import { ${model} } from '../database/${model.toLowerCase()}.schema';\n`;
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
    case 'mongoose':
      return model;
    case 'prisma':
      return `'${model}'`;
    case 'drizzle':
      if (model === 'Company') return "'companies'";
      if (model === 'User') return "'users'";
      return `'${model.toLowerCase()}s'`;
    default:
      return `'${model}'`;
  }
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

  switch (options.orm) {
    case 'typeorm':
      return `(dataSource: DataSource) => ({
        orm: 'typeorm' as const,
        dataSource,
        basePath: '/admin',
        title: '${title}',
        resources: [${RESOURCE_LIST}],
      })`;
    case 'prisma':
      return `(prisma: PrismaService) => ({
        orm: 'prisma' as const,
        dataSource: prisma,
        basePath: '/admin',
        title: '${title}',
        resources: [${RESOURCE_LIST}],
      })`;
    case 'drizzle':
      return `(db: unknown) => ({
        orm: 'drizzle' as const,
        dataSource: { db, schema },
        basePath: '/admin',
        title: '${title}',
        resources: [${RESOURCE_LIST}],
      })`;
    case 'mongoose':
      return `(connection: Connection) => ({
        orm: 'mongoose' as const,
        dataSource: connection,
        basePath: '/admin',
        title: '${title}',
        resources: [${RESOURCE_LIST}],
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

  if (options.orm === 'mongoose') {
    files.push(
      [`${dbDir}/company.schema.ts`, generateMongooseCompanySchema()],
      [`${dbDir}/user.schema.ts`, generateMongooseUserSchema()],
      [`${dbDir}/database.module.ts`, generateMongooseDatabaseModule()],
    );
  }

  return files;
}
