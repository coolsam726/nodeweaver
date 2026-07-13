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

console.log('Loom assets copied to dist/');
