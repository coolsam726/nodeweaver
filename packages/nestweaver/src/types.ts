export type Orm = 'typeorm' | 'prisma' | 'drizzle' | 'mongoose' | 'none';
export type Database = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
export type HttpAdapter = 'fastify' | 'express';
export type RenderMode = 'ssr' | 'spa';
export type Frontend =
  | 'nuxt'
  | 'angular'
  | 'vite-react'
  | 'vite-vue'
  | 'vite-svelte';

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
  /** Used when frontend is Nuxt or Angular. */
  renderMode: RenderMode;
}

export interface TemplateContext extends ScaffoldOptions {
  sharedScope: string;
  frontendLabel: string;
  isNuxt: boolean;
  isAngular: boolean;
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
}
