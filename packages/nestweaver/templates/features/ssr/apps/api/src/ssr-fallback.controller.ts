import { All, Controller, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response, RequestHandler } from 'express';

type SsrListener = RequestHandler;

let ssrListener: SsrListener | null = null;

export function setSsrListener(listener: SsrListener): void {
  ssrListener = listener;
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
export class SsrFallbackController {
  @All('*')
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    const path = req.path ?? req.url ?? '';
    if (isNestOwnedPath(path) || !ssrListener) {
      return next();
    }

    void ssrListener(req, res, next);
  }
}
