export type Orm = 'typeorm' | 'prisma' | 'drizzle' | 'mongoose' | 'none';
export type Database = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
export type HttpAdapter = 'fastify' | 'express';
export type NuxtMode = 'ssr' | 'spa';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  orm: Orm;
  database: Database | null;
  scheduling: boolean;
  queues: boolean;
  httpAdapter: HttpAdapter;
  admin: boolean;
  nuxtMode: NuxtMode;
}

export interface TemplateContext extends ScaffoldOptions {
  sharedScope: string;
  isSsr: boolean;
  isSpa: boolean;
  isFastify: boolean;
  isExpress: boolean;
  hasDatabase: boolean;
  dockerServices: boolean;
  infraServices: string;
  hasInfraServices: boolean;
  nestPort: number;
  nuxtDevPort: number;
}
