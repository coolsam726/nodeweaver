import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createNoopAdapter, createLoomAdapter, type LoomAdapter } from '../adapters/adapter.js';
import { assertLoomDeprecations, assertLoomProductionAuth } from '../core/assert-options.js';
import { ResourceRegistry } from '../core/registry.js';
import { createLoomRbacStore, createNoopRbacStore, LOOM_RBAC } from '../core/rbac-store.js';
import { resolveStorageAdapter } from '../core/storage.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY, LOOM_STORAGE } from '../core/types.js';
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
  if (api && typeof api === 'object' && api.version) {
    const version = api.version.replace(/^\//, '').replace(/\/$/, '');
    return version ? `api/loom/${version}` : 'api/loom';
  }
  return 'api/loom';
}

function resolveStorage(options: LoomModuleOptions) {
  return resolveStorageAdapter(options.storage);
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
      {
        provide: LOOM_STORAGE,
        useFactory: resolveStorage,
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
      LOOM_STORAGE,
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

  /**
   * Async Loom setup. Nest registers controllers when the module is defined —
   * before `useFactory` runs — so **`basePath` and `api` must be set here**
   * (synchronously), not only inside the factory. Values from the factory are
   * still used for everything else (ORM, auth, resources, …).
   */
  static forRootAsync(asyncOptions: {
    imports?: DynamicModule['imports'];
    inject?: InjectionToken[];
    /**
     * Admin URL prefix for the Nest controller (default `/admin`).
     * Required here when not using the default — factory `basePath` alone is ignored for routing.
     */
    basePath?: string;
    /**
     * JSON API enablement / prefix / version. Same sync constraint as `basePath`.
     */
    api?: LoomModuleOptions['api'];
    useFactory: (...args: unknown[]) => LoomModuleOptions | Promise<LoomModuleOptions>;
  }): DynamicModule {
    const routeOptions: LoomModuleOptions = {
      resources: [],
      basePath: asyncOptions.basePath,
      api: asyncOptions.api,
    };
    return {
      ...buildLoomModule(routeOptions, [
        {
          provide: LOOM_OPTIONS,
          useFactory: async (...args: unknown[]) => {
            const resolved = await asyncOptions.useFactory(...args);
            return normalizeOptions({
              ...resolved,
              // Prefer sync routing options so HTML links match the registered controller.
              basePath: asyncOptions.basePath ?? resolved.basePath,
              api: asyncOptions.api ?? resolved.api,
            });
          },
          inject: asyncOptions.inject ?? [],
        },
      ]),
      imports: asyncOptions.imports ?? [],
    };
  }
}
