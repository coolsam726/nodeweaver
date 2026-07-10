import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { generateApiPackageJson } from './generators/api-package-json.js';
import { generateAppModule } from './generators/app-module.js';
import { generateEnvExample } from './generators/env.js';
import { generateMain } from './generators/main.js';
import { generateIndexVue, generateNuxtConfig } from './generators/nuxt-config.js';
import {
  generateDockerCompose,
  needsDockerServices,
  dockerInfraServiceNames,
} from './generators/docker-compose.js';
import { NEST_DEFAULT_PORT } from './constants.js';
import { generateTypeormDatabaseModule } from './generators/typeorm-database-module.js';
import { generatePnpmWorkspace } from './generators/pnpm-workspace.js';
import { renderFile, toContext } from './render.js';
import type { ScaffoldOptions, TemplateContext } from './types.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_ROOT = join(PACKAGE_ROOT, 'templates');

const SKIP = new Set(['node_modules', '.git', 'dist', '.output', '.nuxt']);

export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
  const context = toContext(options);
  const { targetDir, projectName, sharedScope } = context;

  mkdirSync(targetDir, { recursive: true });

  copyDir(join(TEMPLATES_ROOT, 'base'), targetDir, context);
  applyFeatures(options, context);

  writeGeneratedFiles(options, context);

  console.log('Installing dependencies...');
  execSync('pnpm install', { cwd: targetDir, stdio: 'inherit' });

  printNextSteps(options);
}

function applyFeatures(options: ScaffoldOptions, context: TemplateContext): void {
  const features = join(TEMPLATES_ROOT, 'features');

  if (options.orm !== 'none' && options.database) {
    const ormDir = join(features, 'orm', options.orm);
    copyDir(join(ormDir, '_shared'), options.targetDir, context);
    if (options.orm !== 'mongoose') {
      copyDir(join(ormDir, options.database), options.targetDir, context);
    }
  }

  if (options.scheduling) {
    copyDir(join(features, 'scheduling'), options.targetDir, context);
  }

  if (options.queues) {
    copyDir(join(features, 'queues'), options.targetDir, context);
  }

  if (options.admin) {
    copyDir(join(features, 'admin', options.httpAdapter), options.targetDir, context);
  }

  if (options.nuxtMode === 'spa') {
    copyDir(join(features, 'nuxt-spa'), options.targetDir, context);
  }
}

function writeGeneratedFiles(
  options: ScaffoldOptions,
  context: TemplateContext,
): void {
  const { targetDir, sharedScope } = context;

  const writes: Array<[string, string]> = [
    [join(targetDir, 'apps/api/src/main.ts'), generateMain(options)],
    [join(targetDir, 'apps/api/src/app.module.ts'), generateAppModule(options)],
    [
      join(targetDir, 'apps/api/package.json'),
      `${JSON.stringify(generateApiPackageJson(options, sharedScope), null, 2)}\n`,
    ],
    [join(targetDir, 'apps/web/nuxt.config.ts'), generateNuxtConfig(options)],
    [
      join(targetDir, 'apps/web/app/pages/index.vue'),
      generateIndexVue(options),
    ],
    [join(targetDir, '.env.example'), generateEnvExample(options)],
    [join(targetDir, 'pnpm-workspace.yaml'), generatePnpmWorkspace(options)],
  ];

  if (needsDockerServices(options)) {
    writes.push([
      join(targetDir, 'docker-compose.yml'),
      generateDockerCompose(options),
    ]);
  }

  if (options.orm === 'typeorm' && options.database) {
    writes.push([
      join(targetDir, 'apps/api/src/database/database.module.ts'),
      generateTypeormDatabaseModule(options),
    ]);
  }

  for (const [filePath, content] of writes) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

function isScaffoldTemplate(relativePath: string): boolean {
  if (relativePath.includes('/views/') || relativePath.startsWith('views/')) {
    return false;
  }
  return relativePath.endsWith('.hbs');
}

function copyDir(
  sourceRoot: string,
  targetRoot: string,
  context: TemplateContext,
): void {
  if (!existsSync(sourceRoot)) return;

  walk(sourceRoot, (sourcePath) => {
    const rel = relative(sourceRoot, sourcePath);
    const renderTemplate = isScaffoldTemplate(rel);
    const destPath = join(
      targetRoot,
      renderTemplate && rel.endsWith('.hbs') ? rel.slice(0, -4) : rel,
    );

    mkdirSync(dirname(destPath), { recursive: true });

    if (renderTemplate) {
      writeFileSync(destPath, renderFile(sourcePath, context));
    } else {
      cpSync(sourcePath, destPath);
    }
  });
}

function walk(dir: string, onFile: (path: string) => void): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, onFile);
    } else {
      onFile(path);
    }
  }
}

function printNextSteps(options: ScaffoldOptions): void {
  console.log('');
  console.log(`Done! Project scaffolded at ${options.targetDir}`);
  console.log('');
  console.log(`  cd ${options.projectName}`);
  console.log('  docker compose up --build   # full dev stack (app + services)');
  console.log('');
  console.log('  # Or run the app locally:');
  console.log('  cp .env.example .env');
  const infra = dockerInfraServiceNames(options);
  if (infra.length > 0) {
    console.log(`  docker compose up -d ${infra.join(' ')}`);
  }
  console.log('  pnpm dev');
  console.log('');
  console.log(`Open http://localhost:${NEST_DEFAULT_PORT}`);
  if (options.admin) {
    console.log(`Admin: http://localhost:${NEST_DEFAULT_PORT}/admin`);
  }
}
