import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PATH_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { LoomModule } from '../src/nest/loom.module.js';

describe('LoomModule.forRootAsync routing', () => {
  it('registers the admin controller at sync basePath (not factory-only)', () => {
    const mod = LoomModule.forRootAsync({
      basePath: '/app',
      api: { version: 'v1' },
      useFactory: () => ({
        resources: [],
        allowAnonymousAdmin: true,
        // Intentionally different — must not win for Nest @Controller path
        basePath: '/ignored-async-only',
      }),
    });

    const controllers = mod.controllers ?? [];
    assert.ok(controllers.length >= 1);
    const adminPath = Reflect.getMetadata(PATH_METADATA, controllers[0]!);
    assert.equal(adminPath, 'app');

    const apiCtrl = controllers[1];
    assert.ok(apiCtrl);
    const apiPath = Reflect.getMetadata(PATH_METADATA, apiCtrl);
    assert.equal(apiPath, 'api/loom/v1');
  });

  it('defaults admin controller to admin when basePath omitted', () => {
    const mod = LoomModule.forRootAsync({
      useFactory: () => ({
        resources: [],
        allowAnonymousAdmin: true,
        basePath: '/app',
      }),
    });
    const adminPath = Reflect.getMetadata(PATH_METADATA, mod.controllers![0]!);
    // Factory basePath alone cannot change the registered route (Nest limitation).
    assert.equal(adminPath, 'admin');
  });
});
