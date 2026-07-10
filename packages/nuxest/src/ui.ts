import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPackageVersion(): string {
  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function printBanner(): void {
  const version = readPackageVersion();
  console.log('');
  console.log(`  nuxest ${version}  ·  NestJS + frontend monorepo scaffolder`);
  console.log('');
}

export function printHelp(): void {
  printBanner();
  console.log(`Usage:
  npm create nuxest@latest [directory]
  pnpm create nuxest [directory]
  yarn create nuxest [directory]
  bun create nuxest [directory]

  nuxest [directory]
  nuxest create [directory]

Arguments:
  directory          Project folder name, or "." for the current directory

Options:
  -h, --help         Show this help
  -v, --version      Show version

You will be asked interactively:
  • Frontend (Nuxt, Vite + React/Vue/Svelte)
  • Database (PostgreSQL, MySQL, SQLite, MongoDB, or none)
  • ORM / ODM (filtered by database — e.g. Mongoose for MongoDB)
  • Task scheduling (@nestjs/schedule)
  • Job queues (BullMQ + Redis)
  • HTTP adapter (Fastify or Express)
  • MVC admin panel (Handlebars at /admin)
  • Nuxt mode (SSR or SPA — when Nuxt is selected)
`);
}
