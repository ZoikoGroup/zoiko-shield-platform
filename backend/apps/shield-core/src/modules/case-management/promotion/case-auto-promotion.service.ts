import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import {
  CANONICAL_TOPICS,
  EventEnvelope,
} from '../../../kafka/kafka-producer.service';
import { CaseService } from '../services/case.service';

/**
 * The missing hop between detection and investigation.
 *
 * Detection already ran end to end without a human: an event arrived, a rule
 * matched, an alert was written and `alert.created.v1` was published. But
 * nothing consumed that event to open a case, so every alert stopped at the
 * alert queue until somebody called POST /api/v1/cases by hand. That made the
 * detection-to-case hop the one break in the slice that no amount of
 * front-end work could paper over.
 *
 * Promotion is deliberately not "every alert gets a case". An alert is a
 * signal; a case is a commitment to investigate, and auto-opening one for
 * every low-severity signal would bury the queue. The rule here is explicit
 * and configurable rather than clever: promote at or above a severity
 * threshold, leave everything below it for an operator to promote manually
 * through the same code path.
 */

const ALERT_CREATED_TOPIC = CANONICAL_TOPICS.ALERT_CREATED;

/** Ordered weakest to strongest — an alert promotes when its severity is at or above the configured floor. */
const SEVERITY_ORDER = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const DEFAULT_MINIMUM_SEVERITY = 'HIGH';

/** Cases are opened by the platform itself here, not by a signed-in operator. */
export const AUTO_PROMOTION_ACTOR = 'system:case-auto-promotion';

@Injectable()
export class CaseAutoPromotionService implements OnModuleInit {
  private readonly logger = new Logger(CaseAutoPromotionService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly caseService: CaseService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn(
        'CASE_AUTO_PROMOTION_ENABLED=false — alerts will not open cases automatically; every case must be opened by hand.',
      );
      return;
    }
    this.kafkaConsumer.registerHandler(
      ALERT_CREATED_TOPIC,
      this.handleAlertCreated.bind(this),
    );
    this.logger.log(
      `Auto-promoting alerts at or above ${this.minimumSeverity} severity to cases.`,
    );
  }

  private get enabled(): boolean {
    return process.env.CASE_AUTO_PROMOTION_ENABLED !== 'false';
  }

  private get minimumSeverity(): string {
    const configured = (
      process.env.CASE_AUTO_PROMOTION_MIN_SEVERITY ?? DEFAULT_MINIMUM_SEVERITY
    )
      .trim()
      .toUpperCase();
    if (
      !SEVERITY_ORDER.includes(configured as (typeof SEVERITY_ORDER)[number])
    ) {
      this.logger.warn(
        `CASE_AUTO_PROMOTION_MIN_SEVERITY='${configured}' is not one of ${SEVERITY_ORDER.join(', ')} — falling back to ${DEFAULT_MINIMUM_SEVERITY}.`,
      );
      return DEFAULT_MINIMUM_SEVERITY;
    }
    return configured;
  }

  /**
   * An unrecognised severity is promoted rather than dropped. Getting a case
   * that did not need one is a nuisance; silently discarding a signal because
   * a connector spelled its severity differently is a miss.
   */
  private meetsThreshold(severity: string | undefined): boolean {
    const floor = SEVERITY_ORDER.indexOf(
      this.minimumSeverity as (typeof SEVERITY_ORDER)[number],
    );
    const actual = SEVERITY_ORDER.indexOf(
      (severity ?? '').trim().toUpperCase() as (typeof SEVERITY_ORDER)[number],
    );
    if (actual === -1) {
      this.logger.warn(
        `Alert severity '${severity}' is not a known severity — promoting it so the signal is not lost.`,
      );
      return true;
    }
    return actual >= floor;
  }

  private async handleAlertCreated(
    envelope: EventEnvelope<any>,
  ): Promise<void> {
    const { tenantId, alertId, severity } = envelope.payload ?? {};
    if (!tenantId || !alertId) {
      throw new Error(
        `Malformed alert.created payload: ${JSON.stringify(envelope.payload)}`,
      );
    }

    if (!this.meetsThreshold(severity)) {
      this.logger.debug(
        `Alert ${alertId} (${severity}) is below the ${this.minimumSeverity} promotion threshold — leaving it in the alert queue.`,
      );
      return;
    }

    // createFromAlert is idempotent on (tenant, alert): a redelivered
    // alert.created event, or an operator who promoted the alert first,
    // returns the existing case rather than opening a second one.
    const createdCase = await this.caseService.createFromAlert({
      tenantId,
      alertId,
      actorId: AUTO_PROMOTION_ACTOR,
    });

    this.logger.log(
      `Alert ${alertId} (${severity}) promoted to case ${createdCase?.id} for tenant ${tenantId}`,
    );
  }
}
