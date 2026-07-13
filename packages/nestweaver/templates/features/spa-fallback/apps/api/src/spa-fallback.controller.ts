import { All, Controller, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

let spaIndexHtml: string | null = null;

export function setSpaIndexHtml(html: string): void {
  spaIndexHtml = html;
}

function isNestOwnedPath(path: string): boolean {
  const normalized = (path.split('?')[0] ?? '').replace(/\/$/, '') || '/';
  const loomBase = (process.env.LOOM_BASE_PATH || '/admin').replace(/\/$/, '') || '/admin';
  return (
    normalized === '/api' ||
    normalized.startsWith('/api/') ||
    normalized === loomBase ||
    normalized.startsWith(`${loomBase}/`)
  );
}

@Controller()
export class SpaFallbackController {
  @All('*')
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    const path = req.path ?? req.url ?? '';
    if (isNestOwnedPath(path)) {
      return next();
    }

    if (!spaIndexHtml) {
      return next();
    }

    res.type('html').send(spaIndexHtml);
  }
}
