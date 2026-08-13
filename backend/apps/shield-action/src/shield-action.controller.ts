import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldActionController {
  @Get()
  getHello(): string {
    return 'shield-action online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-action',
      timestamp: new Date().toISOString(),
    };
  }
}
