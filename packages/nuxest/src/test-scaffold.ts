import { rmSync, existsSync } from 'node:fs';
import { scaffoldProject } from './scaffold.js';
import type { ScaffoldOptions } from './types.js';

const name = process.argv[2] ?? 'scaffold-test';
const targetDir = `/tmp/${name}`;

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

const options: ScaffoldOptions = {
  projectName: name,
  targetDir,
  orm: 'prisma',
  database: 'postgresql',
  scheduling: true,
  queues: true,
  httpAdapter: 'fastify',
  admin: true,
  nuxtMode: 'ssr',
};

scaffoldProject(options).catch((error) => {
  console.error(error);
  process.exit(1);
});
