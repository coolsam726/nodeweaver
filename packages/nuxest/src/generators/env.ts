import type { ScaffoldOptions } from '../types.js';
import {
  NEST_DEFAULT_PORT,
  NUXT_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';
import { defaultDatabaseUrl } from '../database.js';

export function generateEnvExample(options: ScaffoldOptions): string {
  const lines = [
    '# Nest listen port (user-facing in dev and production)',
    `PORT=${NEST_DEFAULT_PORT}`,
    '',
    '# Set to "production" for prod builds / start:prod',
    '# NODE_ENV=production',
    '',
    '# Nest dev proxy to Nuxt (set automatically in apps/api dev script)',
    '# ENABLE_NUXT_PROXY=true',
    '',
    '# Nuxt dev server URL (internal, used by Nest dev proxy)',
    `NUXT_DEV_URL=http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}`,
    '',
    '# Absolute API base for Nuxt SSR fetches (Nitro does not route /api/* to Nest)',
    `API_BASE_SERVER=${nestApiBaseUrl()}`,
    '',
  ];

  if (options.orm !== 'none' && options.database) {
    lines.push('# Database (localhost — for pnpm dev on host)');
    lines.push(`DATABASE_URL="${defaultDatabaseUrl(options.database, options.projectName)}"`);
    lines.push('');
  }

  if (options.queues) {
    lines.push('# Redis (BullMQ — localhost for pnpm dev on host)');
    lines.push('REDIS_HOST=127.0.0.1');
    lines.push('REDIS_PORT=6379');
    lines.push('');
  }

  lines.push('# Docker Compose overrides DATABASE_URL / REDIS_HOST for the app service.');

  return lines.join('\n');
}
