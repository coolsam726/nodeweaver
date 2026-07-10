import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import { createNoopAdapter, createVelmAdapter, type VelmAdapter } from '../adapters/adapter.js';
import { ResourceRegistry } from '../core/registry.js';
import type { VelmModuleOptions } from '../core/types.js';
import { VELM_ADAPTER, VELM_OPTIONS, VELM_REGISTRY } from '../core/types.js';
import { createVelmController } from './velm.controller.js';
import { VelmService } from './velm.service.js';
import { VelmViewService } from './velm-view.service.js';

function resolveAdapter(options: VelmModuleOptions): VelmAdapter {
  if (options.adapter) {
    return options.adapter;
  }
  if (options.resources.length === 0) {
    return createNoopAdapter();
  }
  if (!options.orm || options.dataSource === undefined) {
    throw new Error('Velm resources require `orm` and `dataSource`');
  }
  return createVelmAdapter(options.orm, options.dataSource);
}

function buildVelmModule(
  options: VelmModuleOptions,
  asyncProviders: Provider[],
): DynamicModule {
  const basePath = options.basePath ?? '/admin';
  const VelmController = createVelmController(basePath);

  return {
    module: VelmModule,
    controllers: [VelmController as Type<unknown>],
    providers: [
      ...asyncProviders,
      { provide: VELM_ADAPTER, useFactory: resolveAdapter, inject: [VELM_OPTIONS] },
      {
        provide: VELM_REGISTRY,
        useFactory: (moduleOptions: VelmModuleOptions) =>
          new ResourceRegistry(moduleOptions.resources),
        inject: [VELM_OPTIONS],
      },
      VelmService,
      VelmViewService,
    ],
    exports: [VelmService, VELM_ADAPTER, VELM_REGISTRY],
  };
}

@Module({})
export class VelmModule {
  static forRoot(options: VelmModuleOptions): DynamicModule {
    return buildVelmModule(options, [{ provide: VELM_OPTIONS, useValue: options }]);
  }

  static forRootAsync(asyncOptions: {
    imports?: DynamicModule['imports'];
    inject?: InjectionToken[];
    useFactory: (...args: unknown[]) => VelmModuleOptions | Promise<VelmModuleOptions>;
  }): DynamicModule {
    return {
      ...buildVelmModule(
        { resources: [] },
        [
          {
            provide: VELM_OPTIONS,
            useFactory: asyncOptions.useFactory,
            inject: asyncOptions.inject ?? [],
          },
        ],
      ),
      imports: asyncOptions.imports ?? [],
    };
  }
}
