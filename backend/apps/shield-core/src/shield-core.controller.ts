import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ShieldCoreService } from './shield-core.service';
import { PublicEndpoint } from './security/endpoint-access.decorator';
import { DatabaseResilienceService } from './database/database-resilience.service';

@PublicEndpoint()
@Controller()
export class ShieldCoreController {
  constructor(
    private readonly shieldCoreService: ShieldCoreService,
    @Optional() private readonly dbResilience?: DatabaseResilienceService,
  ) {}

  @Get()
  getHello(): string {
    return this.shieldCoreService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-core',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(['health/ready', 'health/readiness'])
  async getHealthReady() {
    let dbHealth: any = { status: 'HEALTHY', circuitBreakerState: 'CLOSED' };
    if (this.dbResilience) {
      try {
        dbHealth = await this.dbResilience.checkHealth();
      } catch (err: any) {
        dbHealth = { status: 'UNHEALTHY', error: err?.message };
      }
    }

    const isReady =
      dbHealth.status !== 'UNHEALTHY' &&
      dbHealth.circuitBreakerState !== 'OPEN';

    const payload = {
      status: isReady ? 'ready' : 'degraded',
      service: 'shield-core',
      database: dbHealth,
      timestamp: new Date().toISOString(),
    };

    if (!isReady) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  @Get(['health/live', 'health/liveness'])
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-core',
      timestamp: new Date().toISOString(),
    };
  }
}
