import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldAiController {
  @Get()
  getHello(): string {
    return 'shield-ai online';
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-ai',
      timestamp: new Date().toISOString(),
    };
  }
}
