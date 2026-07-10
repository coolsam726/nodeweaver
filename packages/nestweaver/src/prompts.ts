import { confirm, input, select } from '@inquirer/prompts';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DATABASE_LABELS,
  ORM_LABELS,
  ormsForDatabase,
} from './database.js';
import { FRONTEND_LABELS, supportsRenderMode } from './frontend.js';
import type {
  Database,
  Frontend,
  HttpAdapter,
  RenderMode,
  Orm,
  ScaffoldOptions,
} from './types.js';

function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

type DatabaseChoice = Database | 'none';

export async function collectOptions(
  projectNameArg?: string,
  targetDirArg?: string,
): Promise<ScaffoldOptions> {
  const projectName = projectNameArg
    ? projectNameArg
    : await input({
        message: 'Project name (kebab-case):',
        default: 'my-app',
        validate: (value) =>
          isValidProjectName(value)
            ? true
            : 'Use lowercase letters, numbers, and hyphens (start with a letter).',
      });

  if (!isValidProjectName(projectName)) {
    throw new Error(`Invalid project name: ${projectName}`);
  }

  const targetDir = targetDirArg ?? resolve(process.cwd(), projectName);

  assertTargetDirAvailable(targetDir, Boolean(targetDirArg));

  const frontend = await select<Frontend>({
    message: 'Frontend framework',
    choices: [
      { value: 'nuxt', name: FRONTEND_LABELS.nuxt },
      { value: 'angular', name: FRONTEND_LABELS.angular },
      { value: 'vite-react', name: FRONTEND_LABELS['vite-react'] },
      { value: 'vite-vue', name: FRONTEND_LABELS['vite-vue'] },
      { value: 'vite-svelte', name: FRONTEND_LABELS['vite-svelte'] },
    ],
    default: 'nuxt',
  });

  let renderMode: RenderMode = 'ssr';

  if (supportsRenderMode(frontend)) {
    renderMode = await select<RenderMode>({
      message: `${FRONTEND_LABELS[frontend]} rendering mode`,
      choices: [
        { value: 'ssr', name: 'SSR (server-side rendering)' },
        { value: 'spa', name: 'SPA (client-only, static export style)' },
      ],
      default: 'ssr',
    });
  }

  const databaseChoice = await select<DatabaseChoice>({
    message: 'Database',
    choices: [
      { value: 'postgresql', name: DATABASE_LABELS.postgresql },
      { value: 'mysql', name: DATABASE_LABELS.mysql },
      { value: 'sqlite', name: DATABASE_LABELS.sqlite },
      { value: 'mongodb', name: DATABASE_LABELS.mongodb },
      { value: 'none', name: 'None (skip database setup)' },
    ],
    default: 'postgresql',
  });

  let orm: Orm = 'none';
  let database: Database | null = null;

  if (databaseChoice !== 'none') {
    database = databaseChoice;
    const allowedOrms = ormsForDatabase(database);

    orm = await select<Exclude<Orm, 'none'>>({
      message: 'ORM / ODM',
      choices: allowedOrms.map((value) => ({
        value,
        name: ORM_LABELS[value],
      })),
      default: allowedOrms[0],
    });
  }

  const scheduling = await confirm({
    message: 'Enable task scheduling (@nestjs/schedule)?',
    default: true,
  });

  const queues = await confirm({
    message: 'Enable job queues (BullMQ + Redis)?',
    default: true,
  });

  const httpAdapter = await select<HttpAdapter>({
    message: 'HTTP adapter for NestJS',
    choices: [
      { value: 'fastify', name: 'Fastify (recommended)' },
      { value: 'express', name: 'Express' },
    ],
    default: 'fastify',
  });

  const admin = await confirm({
    message: 'Add Loom admin panel (@nestweaver/loom at /admin)?',
    default: false,
  });

  if (admin && orm === 'none') {
    console.log('  Tip: add an ORM to scaffold Companies and Users resources in Velm.');
  }

  const frontendSummary = supportsRenderMode(frontend)
    ? `${FRONTEND_LABELS[frontend]} (${renderMode.toUpperCase()})`
    : `${FRONTEND_LABELS[frontend]} (SPA)`;

  console.log('');
  console.log(`Scaffolding ${projectName} → ${targetDir}`);
  console.log(
    [
      `  Frontend: ${frontendSummary}`,
      database ? `  Database: ${DATABASE_LABELS[database]}` : '  Database: none',
      orm !== 'none' ? `  ORM: ${ORM_LABELS[orm]}` : null,
      `  Scheduling: ${scheduling ? 'yes' : 'no'}`,
      `  Queues: ${queues ? 'yes' : 'no'}`,
      `  HTTP: ${httpAdapter}`,
      `  Admin: ${admin ? 'yes' : 'no'}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  console.log('');

  return {
    projectName,
    targetDir,
    frontend,
    orm,
    database,
    scheduling,
    queues,
    httpAdapter,
    admin,
    renderMode,
  };
}

function assertTargetDirAvailable(targetDir: string, isExplicitDir: boolean): void {
  const cwd = resolve(process.cwd());
  const resolved = resolve(targetDir);

  if (isExplicitDir && resolved === cwd) {
    const entries = readdirSync(resolved).filter(
      (entry) => entry !== '.git' && entry !== '.gitignore',
    );
    if (entries.length > 0) {
      throw new Error(
        `Current directory is not empty. Scaffold into an empty folder or choose a new name.`,
      );
    }
    return;
  }

  if (existsSync(resolved)) {
    throw new Error(`Directory already exists: ${resolved}`);
  }
}
