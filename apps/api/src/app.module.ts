import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  Type,
} from '@nestjs/common';
import { HealthController } from './health.controller';
import { NuxtDevProxyMiddleware } from './nuxt-dev-proxy.middleware';
import { NuxtFallbackController } from './nuxt-fallback.controller';

@Module({})
export class AppModule implements NestModule {
  static register(): DynamicModule {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

    const controllers: Type[] = [HealthController];

    if (isProduction) {
      controllers.push(NuxtFallbackController);
    }

    return {
      module: AppModule,
      controllers,
      providers: enableNuxtProxy && !isProduction ? [NuxtDevProxyMiddleware] : [],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

    if (!isProduction && enableNuxtProxy) {
      consumer
        .apply(NuxtDevProxyMiddleware)
        .exclude({ path: 'api/*path', method: RequestMethod.ALL })
        .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
  }
}
