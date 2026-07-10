import type { ScaffoldOptions } from '../types.js';
import { NEST_DEFAULT_PORT, NUXT_DEV_DEFAULT_PORT } from '../constants.js';

export function generateMain(options: ScaffoldOptions): string {
  const adminSetupExpress =
    options.admin && options.httpAdapter === 'express'
      ? `
  app.setBaseViewsDir(join(__dirname, 'views'));
  app.setViewEngine('hbs');`
      : '';

  if (options.httpAdapter === 'express') {
    return options.nuxtMode === 'ssr'
      ? generateExpressSsrMain(adminSetupExpress)
      : generateExpressSpaMain(adminSetupExpress);
  }

  return options.nuxtMode === 'ssr'
    ? generateFastifySsrMain(options.admin)
    : generateFastifySpaMain(options.admin);
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
  const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

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

  if (!isProduction && enableNuxtProxy) {
    devProxy = createProxyMiddleware({
      target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}',
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

  logStartup(isProduction, enableNuxtProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableNuxtProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production server listening on http://localhost:\${port}\`);
  } else if (enableNuxtProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend to Nuxt dev)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}

function generateExpressSpaMain(adminSetup: string): string {
  return `import { existsSync, readFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppModule } from './app.module';
import { setSpaIndexHtml } from './nuxt-spa-fallback.controller';

function resolveWebOutputRoot(): string {
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
}

async function mountSpaProduction(app: NestExpressApplication): Promise<void> {
  const outputRoot = resolveWebOutputRoot();
  const publicPath = join(outputRoot, 'public');
  const indexHtml = readFileSync(join(publicPath, 'index.html'), 'utf8');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.static(publicPath));
  setSpaIndexHtml(indexHtml);
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

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

  if (!isProduction && enableNuxtProxy) {
    devProxy = createProxyMiddleware({
      target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}',
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

  logStartup(isProduction, enableNuxtProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableNuxtProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production SPA server listening on http://localhost:\${port}\`);
  } else if (enableNuxtProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend to Nuxt dev)\`,
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
  const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

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

  if (!isProduction && enableNuxtProxy) {
    devProxy = createProxyMiddleware({
      target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}',
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

  logStartup(isProduction, enableNuxtProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableNuxtProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production server listening on http://localhost:\${port}\`);
  } else if (enableNuxtProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend to Nuxt dev)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}

function generateFastifySpaMain(admin: boolean): string {
  const adminRegister = admin
    ? `
  await fastify.register(fastifyView, {
    engine: { handlebars },
    root: join(__dirname, 'views'),
    layout: 'layouts/main.hbs',
  });`
    : '';

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
import { setSpaIndexHtml } from './nuxt-spa-fallback.controller';

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
    if (existsSync(join(candidate, 'public/index.html'))) {
      return candidate;
    }
  }

  throw new Error(
    'Nuxt SPA build output not found. Run "pnpm build" from the monorepo root first.',
  );
}

async function mountSpaProduction(app: NestFastifyApplication): Promise<void> {
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
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableNuxtProxy = process.env.ENABLE_NUXT_PROXY === 'true';

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

  if (!isProduction && enableNuxtProxy) {
    devProxy = createProxyMiddleware({
      target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:${NUXT_DEV_DEFAULT_PORT}',
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

  logStartup(isProduction, enableNuxtProxy, port);
}

function logStartup(
  isProduction: boolean,
  enableNuxtProxy: boolean,
  port: number,
): void {
  if (isProduction) {
    console.log(\`Production SPA server listening on http://localhost:\${port}\`);
  } else if (enableNuxtProxy) {
    console.log(
      \`Dev server listening on http://localhost:\${port} (proxying frontend to Nuxt dev)\`,
    );
  } else {
    console.log(\`API server listening on http://localhost:\${port}\`);
  }
}

void bootstrap();
`;
}
