import type { ScaffoldOptions } from '../types.js';

/** Packages allowed (true) or explicitly denied (false) for pnpm build scripts. */
const BASE_ALLOW_BUILDS: Record<string, boolean> = {
  '@parcel/watcher': true,
  esbuild: true,
  'unrs-resolver': true,
  // Telemetry / polyfill scripts pulled transitively by Swagger UI / Redoc (Loom docs).
  // Explicit false avoids ERR_PNPM_IGNORED_BUILDS when CI uses frozen installs.
  '@scarf/scarf': false,
  'core-js': false,
};

export function generatePnpmWorkspace(options: ScaffoldOptions): string {
  const allowBuilds: Record<string, boolean> = { ...BASE_ALLOW_BUILDS };

  if (options.orm === 'prisma') {
    allowBuilds['@prisma/client'] = true;
    allowBuilds['@prisma/engines'] = true;
    allowBuilds.prisma = true;
  }

  if (
    options.database === 'sqlite' &&
    (options.orm === 'drizzle' || options.orm === 'typeorm')
  ) {
    allowBuilds['better-sqlite3'] = true;
  }

  if (options.queues) {
    allowBuilds['msgpackr-extract'] = true;
  }

  if (options.frontend === 'angular') {
    allowBuilds.lmdb = true;
  }

  const lines = [
    'packages:',
    "  - 'apps/*'",
    "  - 'packages/*'",
    '',
    'allowBuilds:',
    ...Object.keys(allowBuilds)
      .sort()
      .map((pkg) => `  '${pkg}': ${allowBuilds[pkg]}`),
    '',
  ];

  return lines.join('\n');
}
