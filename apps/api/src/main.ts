import { existsSync } from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
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

  await app.init();

  if (isProduction) {
    await mountNuxtProduction(app);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  if (!isProduction && enableNuxtProxy) {
    const devProxy = createProxyMiddleware({
      target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:3001',
      changeOrigin: true,
      ws: true,
    }) as RequestHandler & {
      upgrade: (req: unknown, socket: Socket, head: Buffer) => void;
    };

    const server = app.getHttpServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api')) {
        socket.destroy();
        return;
      }

      devProxy.upgrade(req, socket as Socket, head);
    });
  }

  if (isProduction) {
    console.log(`Production server listening on http://localhost:${port}`);
  } else if (enableNuxtProxy) {
    console.log(
      `Dev server listening on http://localhost:${port} (proxying frontend to Nuxt dev)`,
    );
  } else {
    console.log(`API server listening on http://localhost:${port}`);
  }
}

void bootstrap();
