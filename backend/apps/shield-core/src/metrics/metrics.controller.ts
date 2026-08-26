import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';
import { PublicEndpoint } from '../security/endpoint-access.decorator';

@PublicEndpoint()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: PrometheusMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return this.metricsService.exportPrometheusText();
  }
}
