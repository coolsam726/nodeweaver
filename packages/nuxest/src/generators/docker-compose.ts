import { dockerDatabaseUrl } from '../database.js';
import {
  NEST_DEFAULT_PORT,
  NUXT_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
  scaffoldHostIds,
} from '../constants.js';
import type { ScaffoldOptions } from '../types.js';

/** Docker Compose is always generated for scaffolded projects. */
export function needsDockerServices(_options: ScaffoldOptions): boolean {
  return true;
}

function dbName(projectName: string): string {
  return projectName.replace(/-/g, '_');
}

function infraServices(options: ScaffoldOptions): string[] {
  const lines: string[] = [];

  if (options.database === 'postgresql') {
    const db = dbName(options.projectName);
    lines.push(
      '  postgres:',
      '    image: postgres:16-alpine',
      '    restart: unless-stopped',
      '    ports:',
      "      - '5432:5432'",
      '    environment:',
      '      POSTGRES_USER: postgres',
      '      POSTGRES_PASSWORD: postgres',
      `      POSTGRES_DB: ${db}`,
      '    volumes:',
      '      - postgres_data:/var/lib/postgresql/data',
      '    healthcheck:',
      "      test: ['CMD-SHELL', 'pg_isready -U postgres']",
      '      interval: 5s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  if (options.database === 'mysql') {
    const db = dbName(options.projectName);
    lines.push(
      '  mysql:',
      '    image: mysql:8.4',
      '    restart: unless-stopped',
      '    ports:',
      "      - '3306:3306'",
      '    environment:',
      '      MYSQL_ROOT_PASSWORD: root',
      `      MYSQL_DATABASE: ${db}`,
      '    volumes:',
      '      - mysql_data:/var/lib/mysql',
      '    healthcheck:',
      "      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']",
      '      interval: 5s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  if (options.database === 'mongodb') {
    lines.push(
      '  mongodb:',
      '    image: mongo:7',
      '    restart: unless-stopped',
      '    ports:',
      "      - '27017:27017'",
      '    volumes:',
      '      - mongodb_data:/data/db',
      '    healthcheck:',
      "      test: ['CMD', 'mongosh', '--eval', \"db.adminCommand('ping')\"]",
      '      interval: 5s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  if (options.queues) {
    lines.push(
      '  redis:',
      '    image: redis:7-alpine',
      '    restart: unless-stopped',
      '    ports:',
      "      - '6379:6379'",
      '    volumes:',
      '      - redis_data:/data',
      '    healthcheck:',
      "      test: ['CMD', 'redis-cli', 'ping']",
      '      interval: 5s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  return lines;
}

function infraVolumeNames(options: ScaffoldOptions): string[] {
  const volumes: string[] = [
    'app_node_modules',
    'app_api_node_modules',
    'app_web_node_modules',
  ];

  if (options.database === 'postgresql') volumes.push('postgres_data');
  if (options.database === 'mysql') volumes.push('mysql_data');
  if (options.database === 'mongodb') volumes.push('mongodb_data');
  if (options.database === 'sqlite') volumes.push('sqlite_data');
  if (options.queues) volumes.push('redis_data');

  return volumes;
}

function dependsOnServices(options: ScaffoldOptions): string[] {
  const deps: string[] = [];

  if (options.database === 'postgresql') deps.push('postgres');
  if (options.database === 'mysql') deps.push('mysql');
  if (options.database === 'mongodb') deps.push('mongodb');
  if (options.queues) deps.push('redis');

  if (deps.length === 0) return [];

  return [
    '    depends_on:',
    ...deps.flatMap((service) => [
      `      ${service}:`,
      '        condition: service_healthy',
    ]),
  ];
}

function appEnvironment(options: ScaffoldOptions): string[] {
  const lines = [
    '    environment:',
    '      CI: "true"',
    `      PORT: ${NEST_DEFAULT_PORT}`,
    '      ENABLE_NUXT_PROXY: "true"',
    `      NUXT_DEV_URL: http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}`,
    `      NUXT_DEV_PORT: ${NUXT_DEV_DEFAULT_PORT}`,
    '      NUXT_DEV_HOST: 0.0.0.0',
    `      API_BASE_SERVER: ${nestApiBaseUrl()}`,
  ];

  if (options.orm !== 'none' && options.database) {
    lines.push(
      `      DATABASE_URL: "${dockerDatabaseUrl(options.database, options.projectName)}"`,
    );
  }

  if (options.queues) {
    lines.push('      REDIS_HOST: redis');
    lines.push('      REDIS_PORT: 6379');
  }

  return lines;
}

function appVolumes(options: ScaffoldOptions): string[] {
  const lines = [
    '    volumes:',
    '      - .:/app',
    '      - app_node_modules:/app/node_modules',
    '      - app_api_node_modules:/app/apps/api/node_modules',
    '      - app_web_node_modules:/app/apps/web/node_modules',
  ];

  if (options.database === 'sqlite') {
    lines.push('      - sqlite_data:/app/data');
  }

  return lines;
}

export function generateDockerCompose(options: ScaffoldOptions): string {
  const { uid, gid } = scaffoldHostIds();
  const lines: string[] = [
    'services:',
    '  app:',
    '    build:',
    '      context: .',
    '      target: dev',
    `    user: "${uid}:${gid}"`,
    '    restart: unless-stopped',
    '    ports:',
    `      - '${NEST_DEFAULT_PORT}:${NEST_DEFAULT_PORT}'`,
    `      - '${NUXT_DEV_DEFAULT_PORT}:${NUXT_DEV_DEFAULT_PORT}'`,
    ...appEnvironment(options),
    ...dependsOnServices(options),
    ...appVolumes(options),
    '    command: pnpm dev:docker',
    '',
    ...infraServices(options),
    '',
    'volumes:',
    ...infraVolumeNames(options).map((volume) => `  ${volume}:`),
  ];

  return `${lines.join('\n')}\n`;
}

export function dockerInfraServiceNames(options: ScaffoldOptions): string[] {
  const services: string[] = [];
  if (options.database === 'postgresql') services.push('postgres');
  if (options.database === 'mysql') services.push('mysql');
  if (options.database === 'mongodb') services.push('mongodb');
  if (options.queues) services.push('redis');
  return services;
}
