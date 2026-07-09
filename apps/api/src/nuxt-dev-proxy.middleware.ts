import { Injectable, NestMiddleware } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class NuxtDevProxyMiddleware implements NestMiddleware {
  private readonly proxy = createProxyMiddleware({
    target: process.env.NUXT_DEV_URL ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
    ws: true,
  });

  use(req: Request, res: Response, next: NextFunction): void {
    const url = req.originalUrl ?? req.url ?? '';
    if (url.startsWith('/api')) {
      return next();
    }

    void this.proxy(req, res, next);
  }
}
