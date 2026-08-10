import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { EventEnvelope } from '../kafka/kafka-producer.service';
import { SimulationService } from '../simulation/simulation.service';

const ACTION_APPROVED_TOPIC = 'action.approved.v1';

interface ActionApprovedPayload {
  tenantId: string;
  proposalId: string;
  caseId?: string;
  alertId?: string;
}

/**
 * Trigger only — never the authorization source (spec flow step 7). Every
 * consumed message re-fetches a fresh ActionAuthorizationContext from
 * shield-core rather than trusting anything in this payload.
 */
@Injectable()
export class ActionApprovedConsumer implements OnModuleInit {
  private readonly logger = new Logger(ActionApprovedConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly simulation: SimulationService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler(ACTION_APPROVED_TOPIC, this.handle.bind(this));
  }

  private async handle(envelope: EventEnvelope<ActionApprovedPayload>): Promise<void> {
    const payload = envelope.payload;
    if (!payload?.proposalId) {
      this.logger.warn(`action.approved.v1 event ${envelope.eventId} missing proposalId — skipping`);
      return;
    }

    const outcome = await this.simulation.simulate(payload.proposalId, envelope.correlationId);
    if (outcome.status === 'REJECTED') {
      this.logger.warn(`Proposal ${payload.proposalId} rejected at reauthorization: ${outcome.reason}`);
      return;
    }
    this.logger.log(`Proposal ${payload.proposalId} simulated via action.approved.v1 event ${envelope.eventId}`);
  }
}
