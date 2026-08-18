import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldAnchorController {
  @Get()
  getHello(): string {
    return 'shield-anchor online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-anchor',
      timestamp: new Date().toISOString(),
    };
  }
}
