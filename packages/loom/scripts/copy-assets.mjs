import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyDir(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing source directory: ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyDir(join(packageRoot, 'views'), join(packageRoot, 'dist', 'views'));

const cssSource = join(packageRoot, 'assets', 'admin.css');
const cssTargetDir = join(packageRoot, 'dist', 'assets');
if (existsSync(cssSource)) {
  mkdirSync(cssTargetDir, { recursive: true });
  cpSync(cssSource, join(cssTargetDir, 'admin.css'));
}

const uiSource = join(packageRoot, 'assets', 'velm-ui.js');
if (existsSync(uiSource)) {
  mkdirSync(cssTargetDir, { recursive: true });
  cpSync(uiSource, join(cssTargetDir, 'velm-ui.js'));
}

console.log('Loom assets copied to dist/');
