import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Module } from '@nestjs/common';
import { LoomModule, brandingFromEnv } from '@nestweaver/loom';
import { CompanyResource } from './company.resource';
import { UserResource } from './user.resource';

@Module({
  imports: [
    LoomModule.forRootAsync({
      imports: [],
      inject: [getConnectionToken()],
      useFactory: (connection: Connection) => ({
        orm: 'mongoose' as const,
        dataSource: connection,
        basePath: '/admin',
        branding: brandingFromEnv(process.env),
        resources: [CompanyResource, UserResource],
        companies: [
          { id: '1', name: 'Acme Corp' },
          { id: '2', name: 'Globex Inc' },
        ],
        currentCompanyId: '1',
        user: { name: 'Admin User', email: 'admin@example.com' },
      }),
    }),
  ],
})
export class LoomAdminModule {}
