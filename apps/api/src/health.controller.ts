import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@nest-nuxt-stack/shared';

@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
