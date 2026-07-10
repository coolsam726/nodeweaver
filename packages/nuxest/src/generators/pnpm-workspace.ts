import type { ScaffoldOptions } from '../types.js';

const BASE_ALLOW_BUILDS = [
  '@parcel/watcher',
  'esbuild',
  'unrs-resolver',
] as const;

export function generatePnpmWorkspace(options: ScaffoldOptions): string {
  const allowBuilds = new Set<string>(BASE_ALLOW_BUILDS);

  if (options.orm === 'prisma') {
    allowBuilds.add('@prisma/client');
    allowBuilds.add('@prisma/engines');
    allowBuilds.add('prisma');
  }

  if (
    options.database === 'sqlite' &&
    (options.orm === 'drizzle' || options.orm === 'typeorm')
  ) {
    allowBuilds.add('better-sqlite3');
  }

  if (options.queues) {
    allowBuilds.add('msgpackr-extract');
  }

  const lines = [
    'packages:',
    "  - 'apps/*'",
    "  - 'packages/*'",
    '',
    'allowBuilds:',
    ...[...allowBuilds]
      .sort()
      .map((pkg) => `  '${pkg}': true`),
    '',
  ];

  return lines.join('\n');
}
