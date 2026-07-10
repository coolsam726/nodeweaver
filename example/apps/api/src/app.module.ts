import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
import { QueuesModule } from './queues/queues.module';
import { LoomAdminModule } from './admin/loom-admin.module';
import { SsrFallbackController } from './ssr-fallback.controller';
import { DatabaseModule } from './database/database.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    const isProduction = process.env.NODE_ENV === 'production';

    const controllers: Type[] = [HealthController];

    if (isProduction) {
      controllers.push(SsrFallbackController);
    }

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['../../.env', '../../.env.local', '.env', '.env.local'],
        }),
        ScheduleModule.forRoot(),
        TasksModule,
        QueuesModule,
        LoomAdminModule,
        DatabaseModule,
      ],
      controllers,
    };
  }
}
