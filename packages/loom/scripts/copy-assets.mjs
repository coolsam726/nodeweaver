import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function copyDir(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing source directory: ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyDir(join(packageRoot, 'views'), join(packageRoot, 'dist', 'views'));

const cssTargetDir = join(packageRoot, 'dist', 'assets');
mkdirSync(cssTargetDir, { recursive: true });
mkdirSync(join(packageRoot, 'assets'), { recursive: true });

const cssSource = join(packageRoot, 'assets', 'admin.css');
if (existsSync(cssSource)) {
  cpSync(cssSource, join(cssTargetDir, 'admin.css'));
}

const uiSource = join(packageRoot, 'assets', 'loom-ui.js');
if (existsSync(uiSource)) {
  cpSync(uiSource, join(cssTargetDir, 'loom-ui.js'));
}

// Prefer node_modules alpinejs (pinned dependency); fall back to vendored assets copy.
let alpineSource = join(packageRoot, 'assets', 'alpine.min.js');
try {
  const alpinePkg = dirname(require.resolve('alpinejs/package.json'));
  const fromNpm = join(alpinePkg, 'dist', 'cdn.min.js');
  if (existsSync(fromNpm)) {
    cpSync(fromNpm, join(packageRoot, 'assets', 'alpine.min.js'));
    alpineSource = join(packageRoot, 'assets', 'alpine.min.js');
  }
} catch {
  // use vendored assets/alpine.min.js
}
if (!existsSync(alpineSource)) {
  throw new Error('Missing Alpine.js asset (install alpinejs or vendor assets/alpine.min.js)');
}
cpSync(alpineSource, join(cssTargetDir, 'alpine.min.js'));

// Prefer node_modules swagger-ui-dist; fall back to vendored assets/swagger-ui.
const swaggerTarget = join(cssTargetDir, 'swagger-ui');
const swaggerVendored = join(packageRoot, 'assets', 'swagger-ui');
mkdirSync(swaggerTarget, { recursive: true });
mkdirSync(swaggerVendored, { recursive: true });
const swaggerFiles = ['swagger-ui-bundle.js', 'swagger-ui.css'];
try {
  const swaggerPkg = dirname(require.resolve('swagger-ui-dist/package.json'));
  for (const file of swaggerFiles) {
    const fromNpm = join(swaggerPkg, file);
    if (existsSync(fromNpm)) {
      cpSync(fromNpm, join(swaggerVendored, file));
    }
  }
} catch {
  // use vendored assets/swagger-ui
}
for (const file of swaggerFiles) {
  const source = join(swaggerVendored, file);
  if (!existsSync(source)) {
    throw new Error(
      `Missing Swagger UI asset ${file} (install swagger-ui-dist or vendor assets/swagger-ui/)`,
    );
  }
  cpSync(source, join(swaggerTarget, file));
}

// Prefer node_modules redoc; fall back to vendored assets/redoc.
const redocTarget = join(cssTargetDir, 'redoc');
const redocVendored = join(packageRoot, 'assets', 'redoc');
mkdirSync(redocTarget, { recursive: true });
mkdirSync(redocVendored, { recursive: true });
const redocFile = 'redoc.standalone.js';
try {
  const redocPkg = dirname(require.resolve('redoc/package.json'));
  const fromNpm = join(redocPkg, 'bundles', redocFile);
  if (existsSync(fromNpm)) {
    cpSync(fromNpm, join(redocVendored, redocFile));
  }
} catch {
  // use vendored assets/redoc
}
const redocSource = join(redocVendored, redocFile);
if (!existsSync(redocSource)) {
  throw new Error(
    'Missing Redoc asset (install redoc or vendor assets/redoc/redoc.standalone.js)',
  );
}
cpSync(redocSource, join(redocTarget, redocFile));

console.log('Loom assets copied to dist/');
