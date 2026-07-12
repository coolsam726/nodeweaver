import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createNoopAdapter, createLoomAdapter, type LoomAdapter } from '../adapters/adapter.js';
import { assertLoomDeprecations, assertLoomProductionAuth } from '../core/assert-options.js';
import { ResourceRegistry } from '../core/registry.js';
import { createLoomRbacStore, createNoopRbacStore, LOOM_RBAC } from '../core/rbac-store.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';
import { createLoomController } from './loom.controller.js';
import { createLoomApiController } from './loom-api.controller.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';
import { LoomAuthService } from './loom-auth.service.js';
import { LoomAuthInterceptor } from './loom-auth.interceptor.js';
import { LoomAuthContextInterceptor } from './loom-auth-context.interceptor.js';
import { LoomAbilityGuard, LoomAuthGuard } from './loom-auth.guard.js';
import { LoomForbiddenExceptionFilter } from './loom-forbidden.filter.js';

function resolveAdapter(options: LoomModuleOptions): LoomAdapter {
  if (options.adapter) {
    return options.adapter;
  }
  if (options.resources.length === 0) {
    return createNoopAdapter();
  }
  if (!options.orm || options.dataSource === undefined) {
    throw new Error('Loom resources require `orm` and `dataSource`');
  }
  return createLoomAdapter(options.orm, options.dataSource);
}

function resolveRbac(options: LoomModuleOptions) {
  if (!options.orm || options.dataSource === undefined) {
    return createNoopRbacStore();
  }
  return createLoomRbacStore(options.orm, options.dataSource);
}

function resolveApiPrefix(options: LoomModuleOptions): string | null {
  const api = options.api;
  if (api === false) return null;
  if (api && typeof api === 'object' && api.enabled === false) return null;
  if (api && typeof api === 'object' && api.prefix) {
    return api.prefix.replace(/^\//, '').replace(/\/$/, '') || 'api/loom';
  }
  return 'api/loom';
}

function normalizeOptions(options: LoomModuleOptions): LoomModuleOptions {
  assertLoomProductionAuth(options);
  assertLoomDeprecations(options);
  return options;
}

function buildLoomModule(
  options: LoomModuleOptions,
  asyncProviders: Provider[],
): DynamicModule {
  const basePath = options.basePath ?? '/admin';
  const LoomController = createLoomController(basePath);
  const controllers: Type<unknown>[] = [LoomController as Type<unknown>];

  const apiPrefix = resolveApiPrefix(options);
  if (apiPrefix) {
    controllers.push(createLoomApiController(apiPrefix) as Type<unknown>);
  }

  return {
    module: LoomModule,
    controllers,
    providers: [
      ...asyncProviders,
      { provide: LOOM_ADAPTER, useFactory: resolveAdapter, inject: [LOOM_OPTIONS] },
      {
        provide: LOOM_RBAC,
        useFactory: resolveRbac,
        inject: [LOOM_OPTIONS],
      },
      {
        provide: LOOM_REGISTRY,
        useFactory: (moduleOptions: LoomModuleOptions) =>
          new ResourceRegistry(moduleOptions.resources),
        inject: [LOOM_OPTIONS],
      },
      LoomService,
      LoomViewService,
      LoomAuthService,
      LoomAuthInterceptor,
      LoomAuthContextInterceptor,
      LoomAuthGuard,
      LoomAbilityGuard,
      {
        provide: APP_FILTER,
        useClass: LoomForbiddenExceptionFilter,
      },
    ],
    exports: [
      LoomService,
      LoomAuthService,
      LoomAuthGuard,
      LoomAbilityGuard,
      LoomAuthContextInterceptor,
      LOOM_ADAPTER,
      LOOM_REGISTRY,
      LOOM_RBAC,
    ],
  };
}

@Module({})
export class LoomModule {
  static forRoot(options: LoomModuleOptions): DynamicModule {
    const normalized = normalizeOptions(options);
    return buildLoomModule(normalized, [
      { provide: LOOM_OPTIONS, useValue: normalized },
    ]);
  }

  static forRootAsync(asyncOptions: {
    imports?: DynamicModule['imports'];
    inject?: InjectionToken[];
    useFactory: (...args: unknown[]) => LoomModuleOptions | Promise<LoomModuleOptions>;
  }): DynamicModule {
    return {
      ...buildLoomModule(
        { resources: [] },
        [
          {
            provide: LOOM_OPTIONS,
            useFactory: async (...args: unknown[]) =>
              normalizeOptions(await asyncOptions.useFactory(...args)),
            inject: asyncOptions.inject ?? [],
          },
        ],
      ),
      imports: asyncOptions.imports ?? [],
    };
  }
}
