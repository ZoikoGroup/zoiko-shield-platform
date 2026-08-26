import { Controller, Get, Optional } from '@nestjs/common';
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

  @Get('health/ready')
  async getHealthReady() {
    let dbHealth: any = { status: 'HEALTHY', circuitBreakerState: 'CLOSED' };
    if (this.dbResilience) {
      try {
        dbHealth = await this.dbResilience.checkHealth();
      } catch (err: any) {
        dbHealth = { status: 'DEGRADED', error: err?.message };
      }
    }

    const isReady =
      dbHealth.status !== 'UNHEALTHY' &&
      dbHealth.circuitBreakerState !== 'OPEN';

    return {
      status: isReady ? 'ready' : 'degraded',
      service: 'shield-core',
      database: dbHealth,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-core',
      timestamp: new Date().toISOString(),
    };
  }
}
