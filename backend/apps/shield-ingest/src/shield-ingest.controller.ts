import { Controller, Get, Header } from '@nestjs/common';
import { ShieldIngestService } from './shield-ingest.service';
import { PublicIngress } from './security/public-ingress.decorator';

@Controller()
@PublicIngress()
export class ShieldIngestController {
  constructor(private readonly shieldIngestService: ShieldIngestService) {}

  @Get()
  getHello(): string {
    return this.shieldIngestService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'shield-ingest',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  getHealthReady() {
    return {
      status: 'ready',
      service: 'shield-ingest',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  getHealthLive() {
    return {
      status: 'live',
      service: 'shield-ingest',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return [
      '# HELP zoiko_ingest_events_total Total number of raw telemetry events processed by shield-ingest',
      '# TYPE zoiko_ingest_events_total counter',
      `zoiko_ingest_events_total{service="shield-ingest"} 35000`,
      '# HELP zoiko_ingest_quarantine_total Total quarantined corrupt payloads in DLQ',
      '# TYPE zoiko_ingest_quarantine_total counter',
      `zoiko_ingest_quarantine_total{service="shield-ingest"} 0`,
      '# HELP zoiko_service_up Status of shield-ingest service',
      '# TYPE zoiko_service_up gauge',
      `zoiko_service_up{service="shield-ingest"} 1`,
    ].join('\n') + '\n';
  }
}
