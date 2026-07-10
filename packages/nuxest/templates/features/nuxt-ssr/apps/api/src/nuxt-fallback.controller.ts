import { All, Controller, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response, RequestHandler } from 'express';

type NuxtListener = RequestHandler;

let nuxtListener: NuxtListener | null = null;

export function setNuxtListener(listener: NuxtListener): void {
  nuxtListener = listener;
}

@Controller()
export class NuxtFallbackController {
  @All('*')
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    const path = req.path ?? req.url ?? '';
    if (path.startsWith('/api') || path.startsWith('/admin') || !nuxtListener) {
      return next();
    }

    void nuxtListener(req, res, next);
  }
}
