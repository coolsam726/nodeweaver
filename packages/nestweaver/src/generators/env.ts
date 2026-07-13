import type { ScaffoldOptions } from '../types.js';
import {
  NEST_DEFAULT_PORT,
  WEB_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';
import { defaultDatabaseUrl } from '../database.js';
import { isSsrFrontend } from '../frontend.js';

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

  if (isSsrFrontend(options)) {
    lines.push(
      '# Absolute API base for SSR fetches (frontend dev server does not route /api/* to Nest)',
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

  if (options.admin) {
    lines.push('# Loom admin auth (required for /admin login)');
    lines.push('LOOM_AUTH_SECRET=dev-loom-auth-secret-change-me');
    lines.push('LOOM_ADMIN_EMAIL=admin@example.com');
    lines.push('LOOM_ADMIN_PASSWORD=password');
    lines.push('LOOM_ADMIN_NAME=Admin');
    lines.push('# Must match LoomModule.forRootAsync({ basePath }) — used by the web proxy / SPA fallback');
    lines.push('LOOM_BASE_PATH=/admin');
    lines.push('# Local media uploads for FileField / ImageField');
    lines.push('LOOM_UPLOADS_DIR=./uploads');
    lines.push('');
  }

  lines.push('# Docker Compose overrides DATABASE_URL / REDIS_HOST for the app service.');

  return lines.join('\n');
}
