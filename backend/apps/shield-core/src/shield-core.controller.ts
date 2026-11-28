import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ShieldCoreService } from './shield-core.service';
import { PublicEndpoint } from './security/endpoint-access.decorator';
import { DatabaseResilienceService } from './database/database-resilience.service';
import { KafkaConsumerService } from './kafka/kafka-consumer.service';

@PublicEndpoint()
@Controller()
export class ShieldCoreController {
  constructor(
    private readonly shieldCoreService: ShieldCoreService,
    @Optional() private readonly dbResilience?: DatabaseResilienceService,
    @Optional() private readonly kafkaConsumer?: KafkaConsumerService,
  ) {}

  /** Whether the consumer is doing its job; a service with nothing to consume is fine. */
  private consumerState() {
    const status = this.kafkaConsumer?.getStatus();
    if (!status) return null;
    return { ...status, healthy: status.topics.length === 0 || status.running };
  }

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
      // Informational: a consumer problem does not take the API out of rotation, but it
      // is no longer invisible.
      kafkaConsumer: this.consumerState(),
      timestamp: new Date().toISOString(),
    };

    if (!isReady) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  /**
   * 503 while the Kafka consumer is not running, so a monitor (or an auto-restart) can
   * act on it. Everything fed by the consumer (asset and identity context, case
   * evidence, response actions) is stalled for as long as it is down.
   */
  @Get('health/consumer')
  getHealthConsumer() {
    const state = this.consumerState();
    const payload = {
      status: !state || state.healthy ? 'running' : 'down',
      service: 'shield-core',
      kafkaConsumer: state,
      timestamp: new Date().toISOString(),
    };
    if (state && !state.healthy) throw new ServiceUnavailableException(payload);
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
