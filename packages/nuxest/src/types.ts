export type Orm = 'typeorm' | 'prisma' | 'drizzle' | 'mongoose' | 'none';
export type Database = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
export type HttpAdapter = 'fastify' | 'express';
export type NuxtMode = 'ssr' | 'spa';
export type Frontend = 'nuxt' | 'vite-react' | 'vite-vue' | 'vite-svelte';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  frontend: Frontend;
  orm: Orm;
  database: Database | null;
  scheduling: boolean;
  queues: boolean;
  httpAdapter: HttpAdapter;
  admin: boolean;
  /** Only used when frontend === 'nuxt'. */
  nuxtMode: NuxtMode;
}

export interface TemplateContext extends ScaffoldOptions {
  sharedScope: string;
  frontendLabel: string;
  isNuxt: boolean;
  isVite: boolean;
  isNuxtSsr: boolean;
  isSsr: boolean;
  isSpa: boolean;
  isFastify: boolean;
  isExpress: boolean;
  hasDatabase: boolean;
  dockerServices: boolean;
  infraServices: string;
  hasInfraServices: boolean;
  nestPort: number;
  webDevPort: number;
  /** @deprecated Use webDevPort in new templates. */
  nuxtDevPort: number;
}
