import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasWebApp,
  isNestHbsFrontend,
  isSpaFrontend,
  isSsrFrontend,
  supportsRenderMode,
} from './frontend.js';
import { generateAppModule } from './generators/app-module.js';
import { generateMain } from './generators/main.js';
import { generateEnvExample } from './generators/env.js';
import { scaffoldProject } from './scaffold.js';
import type { ScaffoldOptions } from './types.js';

const base: ScaffoldOptions = {
  projectName: 'nest-hbs-test',
  targetDir: '/tmp/nest-hbs-scaffold-test',
  frontend: 'nest-hbs',
  orm: 'mongoose',
  database: 'mongodb',
  scheduling: false,
  queues: false,
  httpAdapter: 'fastify',
  admin: true,
  renderMode: 'spa',
};

assert.equal(isNestHbsFrontend(base), true);
assert.equal(hasWebApp(base), false);
assert.equal(isSpaFrontend(base), false);
assert.equal(isSsrFrontend(base), false);
assert.equal(supportsRenderMode('nest-hbs'), false);

const main = generateMain(base);
assert.doesNotMatch(main, /ENABLE_WEB_PROXY|createProxyMiddleware|isNestOwnedPath/);
assert.match(main, /Full-stack server listening/);

const appModule = generateAppModule(base);
assert.match(appModule, /SiteModule/);
assert.doesNotMatch(appModule, /SpaFallbackController|SsrFallbackController/);

const env = generateEnvExample(base);
assert.doesNotMatch(env, /WEB_DEV_URL|ENABLE_WEB_PROXY/);
assert.match(env, /LOOM_AUTH_SECRET/);
assert.match(env, /APP_BASE_PATH=/);
assert.match(env, /# APP_BASE_PATH=\/my-app|# Example: APP_BASE_PATH=\/my-app/);

if (existsSync(base.targetDir)) {
  rmSync(base.targetDir, { recursive: true, force: true });
}

process.env.NODEWEAVER_SKIP_INSTALL = '1';
await scaffoldProject(base);

assert.equal(existsSync(join(base.targetDir, 'apps/web')), false);
assert.equal(
  existsSync(join(base.targetDir, 'apps/api/src/site/site.module.ts')),
  true,
);
assert.equal(
  existsSync(join(base.targetDir, 'apps/api/src/app-path.ts')),
  true,
);
assert.equal(
  existsSync(join(base.targetDir, 'apps/api/views/pages/home.hbs')),
  true,
);
assert.equal(
  existsSync(join(base.targetDir, 'apps/api/views/layouts/app-shell.hbs')),
  true,
);

const siteController = readFileSync(
  join(base.targetDir, 'apps/api/src/site/site.controller.ts'),
  'utf8',
);
assert.match(siteController, /appBaseFromEnv|joinAppPath|nestControllerPath/);
assert.match(siteController, /homePath|appPath|assetsPath/);

const publicLayout = readFileSync(
  join(base.targetDir, 'apps/api/views/layouts/public.hbs'),
  'utf8',
);
assert.match(publicLayout, /\{\{assetsPath\}\}/);
assert.match(publicLayout, /\{\{homePath\}\}/);
assert.match(publicLayout, /site\.css/);
assert.doesNotMatch(publicLayout, /href="\/"|href="\/app"|src="\/assets/);
assert.match(publicLayout, /Portal|Sign in/);

const homePage = readFileSync(
  join(base.targetDir, 'apps/api/views/pages/home.hbs'),
  'utf8',
);
assert.match(homePage, /Open portal|Sign in/);
assert.doesNotMatch(homePage, /Open app/);

assert.equal(
  existsSync(join(base.targetDir, 'apps/api/views/assets/site.css')),
  true,
);

const loomAdmin = readFileSync(
  join(base.targetDir, 'apps/api/src/admin/loom-admin.module.ts'),
  'utf8',
);
assert.match(loomAdmin, /appBasePath:\s*process\.env\.APP_BASE_PATH/);

const health = readFileSync(
  join(base.targetDir, 'apps/api/src/health.controller.ts'),
  'utf8',
);
assert.match(health, /joinAppPath|appBaseFromEnv/);

const envFile = readFileSync(join(base.targetDir, '.env.example'), 'utf8');
assert.match(envFile, /APP_BASE_PATH=/);

const generatedMain = readFileSync(
  join(base.targetDir, 'apps/api/src/main.ts'),
  'utf8',
);
assert.doesNotMatch(generatedMain, /createProxyMiddleware/);

const rootPkg = JSON.parse(
  readFileSync(join(base.targetDir, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };
assert.equal(rootPkg.scripts.dev, 'pnpm --filter api dev');
assert.equal(rootPkg.scripts.build, 'pnpm --filter api build');

const dockerfile = readFileSync(join(base.targetDir, 'Dockerfile'), 'utf8');
assert.doesNotMatch(dockerfile, /apps\/web/);
assert.match(dockerfile, /apps\/api\/views/);
// Monorepo scaffolds vendor Loom into packages/loom for Docker.
assert.match(dockerfile, /packages\/loom/);
assert.equal(existsSync(join(base.targetDir, 'packages/loom/package.json')), true);
assert.equal(existsSync(join(base.targetDir, '.npmrc')), true);
assert.match(
  readFileSync(join(base.targetDir, '.npmrc'), 'utf8'),
  /confirm-modules-purge=false/,
);

console.log('nest-hbs scaffold checks passed');
