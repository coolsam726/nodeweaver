#!/usr/bin/env node
import { runCreate } from 'nodeweaver';

runCreate(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
