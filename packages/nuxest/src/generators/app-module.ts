import type { ScaffoldOptions } from '../types.js';

function dbModuleImport(options: ScaffoldOptions): string | null {
  switch (options.orm) {
    case 'typeorm':
      return "import { DatabaseModule } from './database/database.module';";
    case 'prisma':
      return "import { PrismaModule } from './database/prisma.module';";
    case 'drizzle':
      return "import { DrizzleModule } from './database/drizzle.module';";
    case 'mongoose':
      return "import { DatabaseModule } from './database/database.module';";
    default:
      return null;
  }
}

function dbModuleName(options: ScaffoldOptions): string | null {
  switch (options.orm) {
    case 'typeorm':
      return 'DatabaseModule';
    case 'prisma':
      return 'PrismaModule';
    case 'drizzle':
      return 'DrizzleModule';
    case 'mongoose':
      return 'DatabaseModule';
    default:
      return null;
  }
}

export function generateAppModule(options: ScaffoldOptions): string {
  const imports: string[] = [
    "import { DynamicModule, Module, Type } from '@nestjs/common';",
    "import { ConfigModule } from '@nestjs/config';",
    "import { HealthController } from './health.controller';",
  ];

  if (options.scheduling) {
    imports.push("import { ScheduleModule } from '@nestjs/schedule';");
    imports.push("import { TasksModule } from './tasks/tasks.module';");
  }

  if (options.queues) {
    imports.push("import { QueuesModule } from './queues/queues.module';");
  }

  if (options.admin) {
    imports.push("import { AdminModule } from './admin/admin.module';");
  }

  const fallbackImport =
    options.nuxtMode === 'ssr'
      ? "import { NuxtFallbackController } from './nuxt-fallback.controller';"
      : "import { NuxtSpaFallbackController } from './nuxt-spa-fallback.controller';";

  imports.push(fallbackImport);

  const dbImport = dbModuleImport(options);
  if (dbImport) imports.push(dbImport);

  const moduleImports: string[] = [
    `ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['../../.env', '../../.env.local', '.env', '.env.local'],
        })`,
  ];

  if (options.scheduling) {
    moduleImports.push('ScheduleModule.forRoot()');
    moduleImports.push('TasksModule');
  }

  if (options.queues) moduleImports.push('QueuesModule');
  if (options.admin) moduleImports.push('AdminModule');

  const dbMod = dbModuleName(options);
  if (dbMod) moduleImports.push(dbMod);

  const fallbackController =
    options.nuxtMode === 'ssr'
      ? 'NuxtFallbackController'
      : 'NuxtSpaFallbackController';

  return `${imports.join('\n')}

@Module({})
export class AppModule {
  static register(): DynamicModule {
    const isProduction = process.env.NODE_ENV === 'production';

    const controllers: Type[] = [HealthController];

    if (isProduction) {
      controllers.push(${fallbackController});
    }

    return {
      module: AppModule,
      imports: [
        ${moduleImports.join(',\n        ')},
      ],
      controllers,
    };
  }
}
`;
}
