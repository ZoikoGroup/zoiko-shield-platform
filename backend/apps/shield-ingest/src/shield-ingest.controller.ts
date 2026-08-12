import { Controller, Get } from '@nestjs/common';
import { ShieldIngestService } from './shield-ingest.service';

@Controller()
export class ShieldIngestController {
  constructor(private readonly shieldIngestService: ShieldIngestService) {}

  @Get()
  getHello(): string {
    return this.shieldIngestService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'healthy', service: 'shield-ingest', timestamp: new Date().toISOString() };
  }

  @Get('health/ready')
  getHealthReady() {
    return { status: 'ready', service: 'shield-ingest', timestamp: new Date().toISOString() };
  }

  @Get('health/live')
  getHealthLive() {
    return { status: 'live', service: 'shield-ingest', timestamp: new Date().toISOString() };
  }
}
