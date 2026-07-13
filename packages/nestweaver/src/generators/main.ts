import type { ScaffoldOptions } from '../types.js';
import { isSsrFrontend } from '../frontend.js';
import { NEST_DEFAULT_PORT, WEB_DEV_DEFAULT_PORT } from '../constants.js';

const DEV_PROXY_SNIPPET = `
function isWebProxyEnabled(): boolean {
  return process.env.ENABLE_WEB_PROXY === 'true';
}

function webDevTarget(): string {
  return (
    process.env.WEB_DEV_URL ??
    'http://127.0.0.1:${WEB_DEV_DEFAULT_PORT}'
  );
}

/** API + Loom admin. Keep LOOM_BASE_PATH in sync with LoomModule.forRootAsync({ basePath }). */
function isNestOwnedPath(url: string): boolean {
  const path = (url.split('?')[0] ?? '').replace(/\/$/, '') || '/';
  const loomBase = (process.env.LOOM_BASE_PATH || '/admin').replace(/\/$/, '') || '/admin';
  return (
    path === '/api' ||
    path.startsWith('/api/') ||
    path === loomBase ||
    path.startsWith(\`\${loomBase}/\`)
  );
}`;

export function generateMain(options: ScaffoldOptions): string {
  if (options.httpAdapter === 'express') {
    return isSsrFrontend(options)
      ? generateExpressSsrMain(options)
      : generateExpressSpaMain(options);
  }

  return isSsrFrontend(options)
    ? generateFastifySsrMain(options)
    : generateFastifySpaMain(options);
}

function generateExpressSsrMain(options: ScaffoldOptions): string {
  const ssr = ssrProductionBlocks(options, 'express');

  return `import { existsSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setSsrListener } from './ssr-fallback.controller';
${DEV_PROXY_SNIPPET}

${ssr.prelude}

${ssr.mount}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(),
  );
  app.enableShutdownHooks();

  let devProxy:
    | (RequestHandler & {
        upgrade: (req: unknown, socket: Socket, head: Buffer) => void;
      })
    | undefined;

  if (!isProduction && enableWebProxy) {
    devProxy = createProxyMiddleware({
      target: webDevTarget(),
      changeOrigin: true,
      ws: true,
    }) as typeof devProxy;

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl ?? req.url ?? '';
      if (isNestOwnedPath(url)) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountSsrProduction(app);
  }

  const port = Number(process.env.PORT ?? ${NEST_DEFAULT_PORT});
  await app.listen(port);

  if (devProxy) {
    const server = app.getHttpServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api')) {
        socket.destroy();
        return;
      }

      devProxy.upgrade(req, socket as Socket, head);
    });
  }

  logStartup(isProduction, enableWebProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableWebProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production server listening on http://localhost:\${port}\`);
  } else if (enableWebProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend dev server)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}


function ssrProductionBlocks(
  options: ScaffoldOptions,
  adapter: 'express' | 'fastify',
): { prelude: string; mount: string } {
  if (options.frontend === 'nuxt') {
    const prelude = `function resolveWebOutputRoot(): string {
  const candidates = [
    join(__dirname, '../../web/.output'),
    join(process.cwd(), 'apps/web/.output'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'server/index.mjs'))) {
      return candidate;
    }
  }

  throw new Error(
    'Nuxt SSR build output not found. Run "pnpm build" from the monorepo root first.',
  );
}`;

    const mountExpress = `async function mountSsrProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const listenerPath = join(outputRoot, 'server/index.mjs');
  const publicPath = join(outputRoot, 'public');

  const { listener } = (await import(
    pathToFileURL(listenerPath).href
  )) as { listener: RequestHandler };

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(publicPath));
  setSsrListener(listener);
}`;

    const mountFastify = `async function mountSsrProduction(app: NestFastifyApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const listenerPath = join(outputRoot, 'server/index.mjs');
  const publicPath = join(outputRoot, 'public');

  const { listener } = (await import(
    pathToFileURL(listenerPath).href
  )) as { listener: RequestHandler };

  const fastify = app.getHttpAdapter().getInstance();
  await ensureMiddie(fastify);
  await fastify.register(fastifyStatic, {
    root: publicPath,
    wildcard: false,
  });
  setSsrListener(listener);
}`;

    return {
      prelude,
      mount: adapter === 'express' ? mountExpress : mountFastify,
    };
  }

  if (options.frontend === 'angular') {
    const prelude = `function resolveAngularSsrServerPath(): string {
  const candidates = [
    join(__dirname, '../../web/dist/server/server.mjs'),
    join(process.cwd(), 'apps/web/dist/server/server.mjs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Angular SSR build output not found. Run "pnpm build" from the monorepo root first.',
  );
}`;

    const mount = `async function mountSsrProduction(
  app: ${adapter === 'express' ? 'NestExpressApplication' : 'NestFastifyApplication'},
): Promise<void> {
  const serverPath = resolveAngularSsrServerPath();
  const { reqHandler } = (await import(
    pathToFileURL(serverPath).href
  )) as { reqHandler: RequestHandler };

  setSsrListener(reqHandler);
}`;

    return { prelude, mount };
  }

  throw new Error(`SSR production mount is not supported for ${options.frontend}`);
}

function spaResolveBlock(options: ScaffoldOptions): {
  resolve: string;
  mountExpress: string;
  mountFastify: string;
  errorLabel: string;
} {
  if (options.frontend === 'nuxt') {
    return {
      resolve: `function resolveWebOutputRoot(): string {
  const candidates = [
    join(__dirname, '../../web/.output'),
    join(process.cwd(), 'apps/web/.output'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'public/index.html'))) {
      return candidate;
    }
  }

  throw new Error(
    'Nuxt SPA build output not found. Run "pnpm build" from the monorepo root first.',
  );
}`,
      mountExpress: `async function mountSpaProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const publicPath = join(outputRoot, 'public');
  const indexHtml = readFileSync(join(publicPath, 'index.html'), 'utf8');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(publicPath));
  setSpaIndexHtml(indexHtml);
}`,
      mountFastify: `async function mountSpaProduction(app: NestFastifyApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const publicPath = join(outputRoot, 'public');
  const indexHtml = readFileSync(join(publicPath, 'index.html'), 'utf8');

  const fastify = app.getHttpAdapter().getInstance();
  await ensureMiddie(fastify);
  await fastify.register(fastifyStatic, {
    root: publicPath,
    wildcard: false,
  });
  setSpaIndexHtml(indexHtml);
}`,
      errorLabel: 'Nuxt SPA',
    };
  }

  if (options.frontend === 'angular') {
    return {
      resolve: `function resolveWebOutputRoot(): string {
  const candidates = [
    join(__dirname, '../../web/dist'),
    join(process.cwd(), 'apps/web/dist'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'browser/index.html'))) {
      return join(candidate, 'browser');
    }
  }

  throw new Error(
    'Angular SPA build output not found. Run "pnpm build" from the monorepo root first.',
  );
}`,
      mountExpress: `async function mountSpaProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const indexHtml = readFileSync(join(outputRoot, 'index.html'), 'utf8');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(outputRoot));
  setSpaIndexHtml(indexHtml);
}`,
      mountFastify: `async function mountSpaProduction(app: NestFastifyApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const indexHtml = readFileSync(join(outputRoot, 'index.html'), 'utf8');

  const fastify = app.getHttpAdapter().getInstance();
  await ensureMiddie(fastify);
  await fastify.register(fastifyStatic, {
    root: outputRoot,
    wildcard: false,
  });
  setSpaIndexHtml(indexHtml);
}`,
      errorLabel: 'Angular SPA',
    };
  }

  return {
    resolve: `function resolveWebOutputRoot(): string {
  const candidates = [
    join(__dirname, '../../web/dist'),
    join(process.cwd(), 'apps/web/dist'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new Error(
    'Vite build output not found. Run "pnpm build" from the monorepo root first.',
  );
}`,
    mountExpress: `async function mountSpaProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const indexHtml = readFileSync(join(outputRoot, 'index.html'), 'utf8');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(outputRoot));
  setSpaIndexHtml(indexHtml);
}`,
    mountFastify: `async function mountSpaProduction(app: NestFastifyApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const indexHtml = readFileSync(join(outputRoot, 'index.html'), 'utf8');

  const fastify = app.getHttpAdapter().getInstance();
  await ensureMiddie(fastify);
  await fastify.register(fastifyStatic, {
    root: outputRoot,
    wildcard: false,
  });
  setSpaIndexHtml(indexHtml);
}`,
    errorLabel: 'Vite SPA',
  };
}

function generateExpressSpaMain(options: ScaffoldOptions): string {
  const spa = spaResolveBlock(options);

  return `import { existsSync, readFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setSpaIndexHtml } from './spa-fallback.controller';
${DEV_PROXY_SNIPPET}

${spa.resolve}

${spa.mountExpress}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(),
  );
  app.enableShutdownHooks();

  let devProxy:
    | (RequestHandler & {
        upgrade: (req: unknown, socket: Socket, head: Buffer) => void;
      })
    | undefined;

  if (!isProduction && enableWebProxy) {
    devProxy = createProxyMiddleware({
      target: webDevTarget(),
      changeOrigin: true,
      ws: true,
    }) as typeof devProxy;

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl ?? req.url ?? '';
      if (isNestOwnedPath(url)) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountSpaProduction(app);
  }

  const port = Number(process.env.PORT ?? ${NEST_DEFAULT_PORT});
  await app.listen(port);

  if (devProxy) {
    const server = app.getHttpServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api')) {
        socket.destroy();
        return;
      }

      devProxy.upgrade(req, socket as Socket, head);
    });
  }

  logStartup(isProduction, enableWebProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableWebProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production SPA server listening on http://localhost:\${port}\`);
  } else if (enableWebProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend dev server)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}

function generateFastifySsrMain(options: ScaffoldOptions): string {
  const ssr = ssrProductionBlocks(options, 'fastify');

  return `import { existsSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setSsrListener } from './ssr-fallback.controller';
${DEV_PROXY_SNIPPET}

async function ensureMiddie(fastify: FastifyInstance): Promise<void> {
  if (!fastify.hasDecorator('use')) {
    await fastify.register(middie);
  }
}

${ssr.prelude}

${ssr.mount}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(),
    new FastifyAdapter(),
  );
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();

  let devProxy:
    | (RequestHandler & {
        upgrade: (req: unknown, socket: Socket, head: Buffer) => void;
      })
    | undefined;

  if (!isProduction && enableWebProxy) {
    devProxy = createProxyMiddleware({
      target: webDevTarget(),
      changeOrigin: true,
      ws: true,
    }) as typeof devProxy;

    await ensureMiddie(fastify);
    fastify.use((req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl ?? req.url ?? '';
      if (isNestOwnedPath(url)) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountSsrProduction(app);
  }

  const port = Number(process.env.PORT ?? ${NEST_DEFAULT_PORT});
  await app.listen(port, '0.0.0.0');

  if (devProxy) {
    const server = app.getHttpServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api')) {
        socket.destroy();
        return;
      }

      devProxy.upgrade(req, socket as Socket, head);
    });
  }

  logStartup(isProduction, enableWebProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableWebProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production server listening on http://localhost:\${port}\`);
  } else if (enableWebProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend dev server)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}

function generateFastifySpaMain(options: ScaffoldOptions): string {
  const spa = spaResolveBlock(options);

  return `import { existsSync, readFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setSpaIndexHtml } from './spa-fallback.controller';
${DEV_PROXY_SNIPPET}

async function ensureMiddie(fastify: FastifyInstance): Promise<void> {
  if (!fastify.hasDecorator('use')) {
    await fastify.register(middie);
  }
}

${spa.resolve}

${spa.mountFastify}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(),
    new FastifyAdapter(),
  );
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();

  let devProxy:
    | (RequestHandler & {
        upgrade: (req: unknown, socket: Socket, head: Buffer) => void;
      })
    | undefined;

  if (!isProduction && enableWebProxy) {
    devProxy = createProxyMiddleware({
      target: webDevTarget(),
      changeOrigin: true,
      ws: true,
    }) as typeof devProxy;

    await ensureMiddie(fastify);
    fastify.use((req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl ?? req.url ?? '';
      if (isNestOwnedPath(url)) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountSpaProduction(app);
  }

  const port = Number(process.env.PORT ?? ${NEST_DEFAULT_PORT});
  await app.listen(port, '0.0.0.0');

  if (devProxy) {
    const server = app.getHttpServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api')) {
        socket.destroy();
        return;
      }

      devProxy.upgrade(req, socket as Socket, head);
    });
  }

  logStartup(isProduction, enableWebProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableWebProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production SPA server listening on http://localhost:\${port}\`);
  } else if (enableWebProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend dev server)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}
