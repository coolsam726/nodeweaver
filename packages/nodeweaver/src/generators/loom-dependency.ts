import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const NODEWEAVER_PACKAGE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);

export interface LoomDependencyResolution {
  specifier: string;
  /** True when Loom will be copied into the scaffold as packages/loom. */
  vendored: boolean;
}

const LOOM_PACKAGE_FILES = ['dist', 'views', 'assets', 'package.json'] as const;

export function resolveLoomDependency(targetDir: string): LoomDependencyResolution {
  const fromEnv = process.env.NODEWEAVER_LOOM_DEP?.trim();
  if (fromEnv) {
    return { specifier: fromEnv, vendored: false };
  }

  if (
    existsSync(join(targetDir, 'packages', 'loom', 'package.json')) ||
    findSourceLoomPackage(targetDir)
  ) {
    return { specifier: 'workspace:*', vendored: true };
  }

  return { specifier: publishedLoomSpecifier(), vendored: false };
}

function publishedLoomSpecifier(): string {
  // Packages are versioned in lockstep; use this package's version for the caret range.
  try {
    const pkg = JSON.parse(
      readFileSync(join(NODEWEAVER_PACKAGE_DIR, 'package.json'), 'utf8'),
    ) as { version?: string };
    return `^${pkg.version ?? '0.1.2'}`;
  } catch {
    return '^0.1.2';
  }
}

/**
 * Copy a built @nodeweaver/loom package into the scaffold for Docker/local self-containment.
 * Only works when scaffolding from this monorepo (or another tree that contains packages/loom).
 * Returns false when Loom should be installed from npm instead.
 */
export function vendorLoomPackage(targetDir: string): boolean {
  const sourceDir = findSourceLoomPackage(targetDir);
  if (!sourceDir) {
    return false;
  }

  ensureLoomBuilt(sourceDir);

  const destDir = join(targetDir, 'packages', 'loom');
  mkdirSync(destDir, { recursive: true });

  for (const item of LOOM_PACKAGE_FILES) {
    const from = join(sourceDir, item);
    if (!existsSync(from)) {
      throw new Error(`Cannot vendor @nodeweaver/loom: missing ${from}`);
    }
    cpSync(from, join(destDir, item), { recursive: true });
  }

  return true;
}

function ensureLoomBuilt(loomDir: string): void {
  const distEntry = join(loomDir, 'dist', 'index.js');
  const css = join(loomDir, 'assets', 'admin.css');
  if (existsSync(distEntry) && existsSync(css)) {
    return;
  }
  execSync('pnpm build && pnpm build:css', { cwd: loomDir, stdio: 'inherit' });
}

function monorepoLoomPackage(): string | null {
  const candidate = join(NODEWEAVER_PACKAGE_DIR, '..', 'loom');
  if (existsSync(join(candidate, 'package.json'))) {
    return candidate;
  }
  return null;
}

function walkUpForLoom(startDir: string, excludeDir?: string): string | null {
  let dir = startDir;

  while (true) {
    const candidate = join(dir, 'packages', 'loom');
    if (
      (!excludeDir || resolve(candidate) !== resolve(excludeDir)) &&
      existsSync(join(candidate, 'package.json'))
    ) {
      return candidate;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function findSourceLoomPackage(targetDir: string): string | null {
  return (
    monorepoLoomPackage() ??
    walkUpForLoom(targetDir, join(targetDir, 'packages', 'loom')) ??
    walkUpForLoom(process.cwd())
  );
}
