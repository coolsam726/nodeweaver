import type { ScaffoldOptions } from '../types.js';
import {
  NEST_DEFAULT_PORT,
  WEB_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';
import { defaultDatabaseUrl } from '../database.js';
import { isNuxtSsr } from '../frontend.js';

export function generateEnvExample(options: ScaffoldOptions): string {
  const lines = [
    '# Nest listen port (user-facing in dev and production)',
    `PORT=${NEST_DEFAULT_PORT}`,
    '',
    '# Set to "production" for prod builds / start:prod',
    '# NODE_ENV=production',
    '',
    '# Nest dev proxy to frontend (set automatically in apps/api dev script)',
    '# ENABLE_WEB_PROXY=true',
    '',
    '# Frontend dev server URL (internal, used by Nest dev proxy)',
    `WEB_DEV_URL=http://127.0.0.1:${WEB_DEV_DEFAULT_PORT}`,
    '',
    '# Bind frontend dev server to all interfaces (Docker sets WEB_DEV_HOST=0.0.0.0 for :3000 debug access)',
    '# WEB_DEV_HOST=127.0.0.1',
    '',
  ];

  if (isNuxtSsr(options)) {
    lines.push(
      '# Absolute API base for Nuxt SSR fetches (Nitro does not route /api/* to Nest)',
      `API_BASE_SERVER=${nestApiBaseUrl()}`,
      '',
    );
  }

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
