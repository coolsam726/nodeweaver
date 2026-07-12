import type { ScaffoldOptions } from '../types.js';

/** Standalone DataSource for `typeorm migration:run` (and production boot via DatabaseModule). */
export function generateTypeormDataSource(
  options: ScaffoldOptions,
): string {
  if (options.orm !== 'typeorm' || !options.database) {
    throw new Error('TypeORM data source requires typeorm ORM and a database');
  }

  const entitiesImport = `import { Company } from './company.entity';
import { LoomPermission } from './loom-permission.entity';
import { LoomRole } from './loom-role.entity';
import { User } from './user.entity';
import { InitSchema1735689600000 } from './migrations/1735689600000-InitSchema';`;

  if (options.database === 'sqlite') {
    return `import 'reflect-metadata';
import { DataSource } from 'typeorm';
${entitiesImport}

export default new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_URL?.replace(/^file:/, '') ?? './data/dev.db',
  entities: [Company, User, LoomRole, LoomPermission],
  migrations: [InitSchema1735689600000],
});
`;
  }

  const type = options.database === 'postgresql' ? 'postgres' : 'mysql';

  return `import 'reflect-metadata';
import { DataSource } from 'typeorm';
${entitiesImport}

export default new DataSource({
  type: '${type}',
  url: process.env.DATABASE_URL,
  entities: [Company, User, LoomRole, LoomPermission],
  migrations: [InitSchema1735689600000],
});
`;
}
