import type { ScaffoldOptions } from '../types.js';

type Deps = Record<string, string>;

const BASE: Deps = {
  '@nestjs/common': '^11.0.1',
  '@nestjs/core': '^11.0.1',
  '@nestjs/config': '^4.0.0',
  'http-proxy-middleware': '^3.0.5',
  'reflect-metadata': '^0.2.2',
  rxjs: '^7.8.1',
};

const HTTP: Record<ScaffoldOptions['httpAdapter'], Deps> = {
  fastify: {
    '@nestjs/platform-fastify': '^11.0.1',
    '@fastify/static': '^8.1.0',
    '@fastify/middie': '^9.0.3',
    fastify: '^5.2.1',
  },
  express: {
    '@nestjs/platform-express': '^11.0.1',
    express: '^5.1.0',
  },
};

const ORM: Record<Exclude<ScaffoldOptions['orm'], 'none'>, Deps> = {
  typeorm: {
    '@nestjs/typeorm': '^11.0.0',
    typeorm: '^0.3.22',
  },
  prisma: {
    '@prisma/client': '^6.6.0',
  },
  drizzle: {
    'drizzle-orm': '^0.41.0',
  },
  mongoose: {
    '@nestjs/mongoose': '^11.0.0',
    mongoose: '^8.13.0',
  },
};

const DB_DRIVER: Record<
  NonNullable<ScaffoldOptions['database']>,
  Deps
> = {
  postgresql: { pg: '^8.14.1' },
  mysql: { mysql2: '^3.14.0' },
  sqlite: { 'better-sqlite3': '^11.9.1' },
  mongodb: {},
};

const SCHEDULING: Deps = {
  '@nestjs/schedule': '^5.0.1',
};

const QUEUES: Deps = {
  '@nestjs/bullmq': '^11.0.2',
  bullmq: '^5.49.0',
  ioredis: '^5.6.0',
};

const ADMIN: Record<ScaffoldOptions['httpAdapter'], Deps> = {
  express: {
    hbs: '^4.2.0',
  },
  fastify: {
    '@fastify/view': '^10.0.1',
    handlebars: '^4.7.8',
  },
};

const DEV_BASE: Deps = {
  '@eslint/eslintrc': '^3.2.0',
  '@eslint/js': '^9.18.0',
  '@nestjs/cli': '^11.0.0',
  '@nestjs/schematics': '^11.0.0',
  '@nestjs/testing': '^11.0.1',
  '@types/express': '^5.0.0',
  '@types/jest': '^30.0.0',
  '@types/node': '^24.0.0',
  '@types/supertest': '^7.0.0',
  eslint: '^9.18.0',
  'eslint-config-prettier': '^10.0.1',
  'eslint-plugin-prettier': '^5.2.2',
  globals: '^17.0.0',
  jest: '^30.0.0',
  prettier: '^3.4.2',
  'source-map-support': '^0.5.21',
  supertest: '^7.0.0',
  'ts-jest': '^29.2.5',
  'ts-loader': '^9.5.2',
  'ts-node': '^10.9.2',
  'tsconfig-paths': '^4.2.0',
  typescript: '^5.7.3',
  'typescript-eslint': '^8.20.0',
};

const DEV_HTTP: Record<ScaffoldOptions['httpAdapter'], Deps> = {
  fastify: {},
  express: {},
};

const DEV_ORM: Partial<Record<ScaffoldOptions['orm'], Deps>> = {
  prisma: {
    prisma: '^6.6.0',
  },
  drizzle: {
    'drizzle-kit': '^0.30.6',
    '@types/better-sqlite3': '^7.6.13',
  },
};

function merge(...maps: Deps[]): Deps {
  return Object.assign({}, ...maps);
}

export function generateApiPackageJson(
  options: ScaffoldOptions,
  sharedScope: string,
): object {
  const deps = merge(BASE, HTTP[options.httpAdapter]);

  if (options.orm !== 'none') {
    Object.assign(deps, ORM[options.orm]);
    if (options.database && options.orm !== 'prisma' && options.orm !== 'mongoose') {
      Object.assign(deps, DB_DRIVER[options.database]);
    }
    if (options.orm === 'drizzle' && options.database === 'sqlite') {
      deps['better-sqlite3'] = '^11.9.1';
    }
  }

  if (options.scheduling) Object.assign(deps, SCHEDULING);
  if (options.queues) Object.assign(deps, QUEUES);
  if (options.admin) Object.assign(deps, ADMIN[options.httpAdapter]);

  const devDeps = merge(DEV_BASE, DEV_HTTP[options.httpAdapter]);
  if (options.orm !== 'none') {
    Object.assign(devDeps, DEV_ORM[options.orm] ?? {});
  }

  const scripts: Record<string, string> = {
    build: 'nest build',
    dev: 'ENABLE_NUXT_PROXY=true nest start --watch',
    format: 'prettier --write "src/**/*.ts" "test/**/*.ts"',
    start: 'nest start',
    'start:debug': 'nest start --debug --watch',
    'start:prod': 'node dist/main',
    lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
    test: 'jest',
    'test:watch': 'jest --watch',
    'test:cov': 'jest --coverage',
    'test:debug':
      'node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand',
    'test:e2e': 'jest --config ./test/jest-e2e.json',
  };

  if (options.orm === 'prisma') {
    scripts.postinstall = 'prisma generate --schema=./prisma/schema.prisma';
    scripts['db:push'] = 'prisma db push --schema=./prisma/schema.prisma';
    scripts['db:studio'] = 'prisma studio --schema=./prisma/schema.prisma';
  }

  if (options.orm === 'drizzle') {
    scripts['db:push'] = 'drizzle-kit push';
    scripts['db:studio'] = 'drizzle-kit studio';
  }

  return {
    name: 'api',
    version: '0.0.1',
    description: 'NestJS API and production HTTP entry',
    private: true,
    license: 'MIT',
    scripts,
    dependencies: {
      [sharedScope]: 'workspace:*',
      ...sortKeys(deps),
    },
    devDependencies: sortKeys(devDeps),
    jest: {
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      collectCoverageFrom: ['**/*.(t|j)s'],
      coverageDirectory: '../coverage',
      testEnvironment: 'node',
    },
  };
}

function sortKeys(obj: Deps): Deps {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
}
