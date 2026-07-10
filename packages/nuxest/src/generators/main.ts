import type { ScaffoldOptions } from '../types.js';
import { isNuxtSsr } from '../frontend.js';
import { NEST_DEFAULT_PORT, WEB_DEV_DEFAULT_PORT } from '../constants.js';

const DEV_PROXY_SNIPPET = `
function isWebProxyEnabled(): boolean {
  return (
    process.env.ENABLE_WEB_PROXY === 'true' ||
    process.env.ENABLE_NUXT_PROXY === 'true'
  );
}

function webDevTarget(): string {
  return (
    process.env.WEB_DEV_URL ??
    process.env.NUXT_DEV_URL ??
    'http://127.0.0.1:${WEB_DEV_DEFAULT_PORT}'
  );
}`;

export function generateMain(options: ScaffoldOptions): string {
  const adminSetupExpress =
    options.admin && options.httpAdapter === 'express'
      ? `
  app.setBaseViewsDir(join(__dirname, 'views'));
  app.setViewEngine('hbs');`
      : '';

  if (options.httpAdapter === 'express') {
    return isNuxtSsr(options)
      ? generateExpressSsrMain(adminSetupExpress)
      : generateExpressSpaMain(adminSetupExpress, options);
  }

  return isNuxtSsr(options)
    ? generateFastifySsrMain(options.admin)
    : generateFastifySpaMain(options.admin, options);
}

function generateExpressSsrMain(adminSetup: string): string {
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
import { setNuxtListener } from './nuxt-fallback.controller';
${DEV_PROXY_SNIPPET}

function resolveWebOutputRoot(): string {
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
    'Nuxt build output not found. Run "pnpm build" from the monorepo root first.',
  );
}

async function mountNuxtProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const listenerPath = join(outputRoot, 'server/index.mjs');
  const publicPath = join(outputRoot, 'public');

  const { listener } = (await import(
    pathToFileURL(listenerPath).href
  )) as { listener: RequestHandler };

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(publicPath));
  setNuxtListener(listener);
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(),
  );
  app.enableShutdownHooks();
${adminSetup}

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
      if (url.startsWith('/api') || url.startsWith('/admin')) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountNuxtProduction(app);
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

function generateExpressSpaMain(
  adminSetup: string,
  options: ScaffoldOptions,
): string {
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
${adminSetup}

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
      if (url.startsWith('/api') || url.startsWith('/admin')) {
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

function generateFastifySsrMain(admin: boolean): string {
  const adminRegister = admin
    ? `
  await fastify.register(fastifyView, {
    engine: { handlebars },
    root: join(__dirname, 'views'),
    layout: 'layouts/main.hbs',
  });`
    : '';

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
import type { FastifyInstance } from 'fastify';${
    admin
      ? `\nimport fastifyView from '@fastify/view';\nimport handlebars from 'handlebars';`
      : ''
  }
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setNuxtListener } from './nuxt-fallback.controller';
${DEV_PROXY_SNIPPET}

async function ensureMiddie(fastify: FastifyInstance): Promise<void> {
  if (!fastify.hasDecorator('use')) {
    await fastify.register(middie);
  }
}

function resolveWebOutputRoot(): string {
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
    'Nuxt build output not found. Run "pnpm build" from the monorepo root first.',
  );
}

async function mountNuxtProduction(app: NestFastifyApplication): Promise<void> {
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
  setNuxtListener(listener);
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableWebProxy = isWebProxyEnabled();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(),
    new FastifyAdapter(),
  );
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
${adminRegister}

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
      if (url.startsWith('/api') || url.startsWith('/admin')) {
        return next();
      }

      devProxy!(req, res, next);
    });
  }

  await app.init();

  if (isProduction) {
    await mountNuxtProduction(app);
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

function generateFastifySpaMain(
  admin: boolean,
  options: ScaffoldOptions,
): string {
  const adminRegister = admin
    ? `
  await fastify.register(fastifyView, {
    engine: { handlebars },
    root: join(__dirname, 'views'),
    layout: 'layouts/main.hbs',
  });`
    : '';

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
import type { FastifyInstance } from 'fastify';${
    admin
      ? `\nimport fastifyView from '@fastify/view';\nimport handlebars from 'handlebars';`
      : ''
  }
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
${adminRegister}

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
      if (url.startsWith('/api') || url.startsWith('/admin')) {
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
