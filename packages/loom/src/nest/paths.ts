import { existsSync } from 'node:fs';
import { join } from 'node:path';

const moduleDir = __dirname;

/**
 * Resolve paths relative to the Velm package root.
 * Prefers package-root `views/` and `assets/` (live in Docker dev mounts)
 * over stale copies under `dist/`.
 */
function resolvePackagePath(...segments: string[]): string {
  const packageRoot = join(moduleDir, '..', '..');
  const fromPackageRoot = join(packageRoot, ...segments);
  if (existsSync(fromPackageRoot)) {
    return fromPackageRoot;
  }
  return join(moduleDir, '..', ...segments);
}

export function velmViewsDir(): string {
  return resolvePackagePath('views');
}

export function velmAssetsDir(): string {
  return resolvePackagePath('assets');
}

export function velmAdminCssPath(): string {
  return join(velmAssetsDir(), 'admin.css');
}

export function velmUiJsPath(): string {
  return join(velmAssetsDir(), 'velm-ui.js');
}
