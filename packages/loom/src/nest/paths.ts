import { existsSync } from 'node:fs';
import { join } from 'node:path';

const moduleDir = __dirname;

/**
 * Resolve paths relative to the Loom package root.
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

export function loomViewsDir(): string {
  return resolvePackagePath('views');
}

export function loomAssetsDir(): string {
  return resolvePackagePath('assets');
}

export function loomAdminCssPath(): string {
  return join(loomAssetsDir(), 'admin.css');
}

export function loomUiJsPath(): string {
  return join(loomAssetsDir(), 'loom-ui.js');
}

export function loomAlpineJsPath(): string {
  return join(loomAssetsDir(), 'alpine.min.js');
}

export function loomSwaggerUiDir(): string {
  return join(loomAssetsDir(), 'swagger-ui');
}

export function loomSwaggerUiBundlePath(): string {
  return join(loomSwaggerUiDir(), 'swagger-ui-bundle.js');
}

export function loomSwaggerUiCssPath(): string {
  return join(loomSwaggerUiDir(), 'swagger-ui.css');
}

export function loomRedocStandalonePath(): string {
  return join(loomAssetsDir(), 'redoc', 'redoc.standalone.js');
}
