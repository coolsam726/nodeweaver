import type { Database, Orm } from './types.js';

export const ORM_LABELS: Record<Exclude<Orm, 'none'>, string> = {
  typeorm: 'TypeORM',
  prisma: 'Prisma',
  drizzle: 'Drizzle ORM',
  mongoose: 'Mongoose',
};

export const DATABASE_LABELS: Record<Database, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL / MariaDB',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
};

/** ORMs available for each database (database is chosen first). */
export const DATABASE_ORMS: Record<Database, Exclude<Orm, 'none'>[]> = {
  postgresql: ['typeorm', 'prisma', 'drizzle'],
  mysql: ['typeorm', 'prisma', 'drizzle'],
  sqlite: ['typeorm', 'prisma', 'drizzle'],
  mongodb: ['mongoose', 'prisma'],
};

export function ormsForDatabase(
  database: Database,
): Exclude<Orm, 'none'>[] {
  return DATABASE_ORMS[database];
}

export function isSqlDatabase(database: Database): boolean {
  return database !== 'mongodb';
}

export function defaultDatabaseUrl(
  database: Database,
  projectName: string,
): string {
  switch (database) {
    case 'postgresql':
      return `postgresql://postgres:postgres@localhost:5432/${projectName.replace(/-/g, '_')}?schema=public`;
    case 'mysql':
      return `mysql://root:root@localhost:3306/${projectName.replace(/-/g, '_')}`;
    case 'sqlite':
      return 'file:./data/dev.db';
    case 'mongodb':
      return `mongodb://localhost:27017/${projectName.replace(/-/g, '_')}`;
  }
}

/** Connection strings for services running inside Docker Compose. */
export function dockerDatabaseUrl(
  database: Database,
  projectName: string,
): string {
  const db = projectName.replace(/-/g, '_');
  switch (database) {
    case 'postgresql':
      return `postgresql://postgres:postgres@postgres:5432/${db}?schema=public`;
    case 'mysql':
      return `mysql://root:root@mysql:3306/${db}`;
    case 'sqlite':
      return 'file:./data/dev.db';
    case 'mongodb':
      return `mongodb://mongodb:27017/${db}`;
  }
}
