import { Controller, Get } from '@nestjs/common';
import { ShieldCoreService } from './shield-core.service';
import { PublicEndpoint } from './security/endpoint-access.decorator';

@PublicEndpoint()
@Controller()
export class ShieldCoreController {
  constructor(private readonly shieldCoreService: ShieldCoreService) {}

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
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-core',
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
