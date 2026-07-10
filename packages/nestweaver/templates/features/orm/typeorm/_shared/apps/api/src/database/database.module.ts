import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './company.entity';
import { User } from './user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: (process.env.DB_TYPE as 'postgres' | 'mysql' | 'sqlite') ?? 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Company, User],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([Company, User]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
