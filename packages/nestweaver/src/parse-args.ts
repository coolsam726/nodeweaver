import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ParsedCreateArgs {
  projectName?: string;
  targetDir?: string;
  help: boolean;
  version: string | null;
}

const PACKAGE_SPECIFIER = /^(create-)?nestweaver(@.+)?$/i;

function isPackageSpecifier(arg: string): boolean {
  return PACKAGE_SPECIFIER.test(arg);
}

function isPathLike(arg: string): boolean {
  return (
    arg === '.' ||
    arg.startsWith('./') ||
    arg.startsWith('../') ||
    arg.includes('/') ||
    arg.includes('\\')
  );
}

export function parseCreateArgs(argv: string[]): ParsedCreateArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, version: null };
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    return { help: false, version: readPackageVersion() };
  }

  const positional = argv
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) => !isPackageSpecifier(arg));

  if (positional.length === 0) {
    return { help: false, version: null };
  }

  if (positional.length >= 2) {
    const projectName = positional[0]!;
    const targetDir = resolve(process.cwd(), positional[1]!);
    return {
      projectName,
      targetDir,
      help: false,
      version: null,
    };
  }

  const raw = positional[0]!;

  if (raw === '.') {
    const targetDir = resolve(process.cwd());
    return {
      projectName: basename(targetDir),
      targetDir,
      help: false,
      version: null,
    };
  }

  if (isPathLike(raw)) {
    const targetDir = resolve(process.cwd(), raw);
    return {
      projectName: basename(targetDir),
      targetDir,
      help: false,
      version: null,
    };
  }

  return {
    projectName: raw,
    targetDir: resolve(process.cwd(), raw),
    help: false,
    version: null,
  };
}

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
