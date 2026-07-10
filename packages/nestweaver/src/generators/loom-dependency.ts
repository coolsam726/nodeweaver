import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const NESTWEAVER_PACKAGE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);

export interface LoomDependencyResolution {
  specifier: string;
}

const LOOM_PACKAGE_FILES = ['dist', 'views', 'assets', 'package.json'] as const;

export function resolveLoomDependency(targetDir: string): LoomDependencyResolution {
  const fromEnv =
    process.env.NESTWEAVER_LOOM_DEP?.trim() ??
    process.env.NESTWEAVER_VELM_DEP?.trim();
  if (fromEnv) {
    return { specifier: fromEnv };
  }

  if (
    existsSync(join(targetDir, 'packages', 'loom', 'package.json')) ||
    findSourceLoomPackage(targetDir)
  ) {
    return { specifier: 'workspace:*' };
  }

  return { specifier: '^0.1.0' };
}

/** Copy a built @nestweaver/loom admin package into the scaffold project for Docker/local self-containment. */
export function vendorLoomPackage(targetDir: string): void {
  const sourceDir = findSourceLoomPackage(targetDir);
  if (!sourceDir) {
    throw new Error(
      'Cannot vendor @nestweaver/loom: source package not found. Set NESTWEAVER_LOOM_DEP or run from the nestweaver monorepo.',
    );
  }

  ensureLoomBuilt(sourceDir);

  const destDir = join(targetDir, 'packages', 'loom');
  mkdirSync(destDir, { recursive: true });

  for (const item of LOOM_PACKAGE_FILES) {
    const from = join(sourceDir, item);
    if (!existsSync(from)) {
      throw new Error(`Cannot vendor @nestweaver/loom: missing ${from}`);
    }
    cpSync(from, join(destDir, item), { recursive: true });
  }
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
  const candidate = join(NESTWEAVER_PACKAGE_DIR, '..', 'loom');
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
