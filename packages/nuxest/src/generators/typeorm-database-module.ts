import type { ScaffoldOptions } from '../types.js';

export function generateTypeormDatabaseModule(
  options: ScaffoldOptions,
): string {
  if (options.orm !== 'typeorm' || !options.database) {
    throw new Error('TypeORM database module requires typeorm ORM and a database');
  }

  if (options.database === 'sqlite') {
    return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './note.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DATABASE_URL?.replace(/^file:/, '') ?? './data/dev.db',
      entities: [Note],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Note]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
`;
  }

  const type = options.database === 'postgresql' ? 'postgres' : 'mysql';

  return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './note.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: '${type}',
      url: process.env.DATABASE_URL,
      entities: [Note],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Note]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
`;
}
