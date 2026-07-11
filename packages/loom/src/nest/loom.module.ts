import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import { createNoopAdapter, createLoomAdapter, type LoomAdapter } from '../adapters/adapter.js';
import { ResourceRegistry } from '../core/registry.js';
import type { LoomModuleOptions } from '../core/types.js';
import { LOOM_ADAPTER, LOOM_OPTIONS, LOOM_REGISTRY } from '../core/types.js';
import { createLoomController } from './loom.controller.js';
import { LoomService } from './loom.service.js';
import { LoomViewService } from './loom-view.service.js';

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

function buildLoomModule(
  options: LoomModuleOptions,
  asyncProviders: Provider[],
): DynamicModule {
  const basePath = options.basePath ?? '/admin';
  const LoomController = createLoomController(basePath);

  return {
    module: LoomModule,
    controllers: [LoomController as Type<unknown>],
    providers: [
      ...asyncProviders,
      { provide: LOOM_ADAPTER, useFactory: resolveAdapter, inject: [LOOM_OPTIONS] },
      {
        provide: LOOM_REGISTRY,
        useFactory: (moduleOptions: LoomModuleOptions) =>
          new ResourceRegistry(moduleOptions.resources),
        inject: [LOOM_OPTIONS],
      },
      LoomService,
      LoomViewService,
    ],
    exports: [LoomService, LOOM_ADAPTER, LOOM_REGISTRY],
  };
}

@Module({})
export class LoomModule {
  static forRoot(options: LoomModuleOptions): DynamicModule {
    return buildLoomModule(options, [{ provide: LOOM_OPTIONS, useValue: options }]);
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
            useFactory: asyncOptions.useFactory,
            inject: asyncOptions.inject ?? [],
          },
        ],
      ),
      imports: asyncOptions.imports ?? [],
    };
  }
}
