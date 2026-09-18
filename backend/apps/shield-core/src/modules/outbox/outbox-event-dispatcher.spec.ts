import { BadRequestException } from '@nestjs/common';
import { DistributedOutboxRelayService } from './distributed-outbox-relay.service';
import { OutboxEventDispatcherService, DomainEventEnvelope } from './outbox-event-dispatcher.service';

describe('OutboxEventDispatcherService (Phase 1 Event Outbox Spine)', () => {
  let relay: DistributedOutboxRelayService;
  let dispatcher: OutboxEventDispatcherService;

  beforeEach(() => {
    relay = new DistributedOutboxRelayService();
    dispatcher = new OutboxEventDispatcherService(relay);
  });

  describe('dispatch', () => {
    it('rejects events missing mandatory canonical context attributes', () => {
      expect(() =>
        dispatcher.dispatch({
          eventType: 'ALERT_CREATED',
          tenantId: '',
          environmentId: 'prod',
          correlationId: 'corr-001',
          payload: { alertId: 'alt-01' },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        dispatcher.dispatch({
          eventType: 'ALERT_CREATED',
          tenantId: 'tenant-001',
          environmentId: '',
          correlationId: 'corr-001',
          payload: { alertId: 'alt-01' },
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        dispatcher.dispatch({
          eventType: 'ALERT_CREATED',
          tenantId: 'tenant-001',
          environmentId: 'prod',
          correlationId: '',
          payload: { alertId: 'alt-01' },
        }),
      ).toThrow(BadRequestException);
    });

    it('enqueues a valid domain event with correct topic and partition key', () => {
      const record = dispatcher.dispatch({
        eventType: 'ALERT_CREATED',
        tenantId: 'tenant-corp-01',
        environmentId: 'production',
        correlationId: 'corr-xyz-123',
        payload: {
          alertId: 'alt-999',
          ruleId: 'R-AUTH-001',
          severity: 'HIGH',
        },
      });

      expect(record.id).toBeDefined();
      expect(record.topic).toBe('shield.core.threats.v1');
      expect(record.partitionKey).toBe('tenant-corp-01:production');
      expect(record.status).toBe('PENDING');
      expect(record.payload.eventType).toBe('ALERT_CREATED');
      expect(record.payload.schemaVersion).toBe('1.1.0');
      expect(record.payload.eventId).toMatch(/^evt-/);
    });

    it('routes domain event types to appropriate Kafka topics', () => {
      const cases = [
        { type: 'ALERT_CREATED' as const, expectedTopic: 'shield.core.threats.v1' },
        { type: 'CASE_PROMOTED' as const, expectedTopic: 'shield.core.threats.v1' },
        { type: 'AI_GROUNDING_REVIEWED' as const, expectedTopic: 'shield.ai.governance.v1' },
        { type: 'SOAR_ACTION_SIMULATED' as const, expectedTopic: 'shield.action.remediation.v1' },
        { type: 'CONTROL_EVALUATED' as const, expectedTopic: 'shield.core.assurance.v1' },
        { type: 'EVIDENCE_ANCHORED' as const, expectedTopic: 'shield.anchor.ledger.v1' },
        { type: 'LEGAL_ACCESS_AUDITED' as const, expectedTopic: 'shield.core.legal-access.v1' },
      ];

      for (const c of cases) {
        const rec = dispatcher.dispatch({
          eventType: c.type,
          tenantId: 't1',
          environmentId: 'prod',
          correlationId: `corr-${c.type}`,
          payload: { test: true },
        });
        expect(rec.topic).toBe(c.expectedTopic);
      }
    });

    it('suppresses duplicate event dispatches with identical idempotency key', () => {
      const event = {
        eventType: 'CONTROL_EVALUATED' as const,
        tenantId: 'tenant-audit-01',
        environmentId: 'production',
        correlationId: 'corr-audit-99',
        payload: { controlId: 'SOC2-CC6.1', score: 100 },
      };

      const first = dispatcher.dispatch(event, { idempotencyKey: 'fixed-key-123' });
      const second = dispatcher.dispatch(event, { idempotencyKey: 'fixed-key-123' });

      expect(first.id).toBe(second.id);
    });

    it('flushes pending events successfully through the relay', async () => {
      dispatcher.dispatch({
        eventType: 'EVIDENCE_ANCHORED',
        tenantId: 'tenant-sec-01',
        environmentId: 'prod',
        correlationId: 'corr-anchor-01',
        payload: { merkleRoot: 'abc123hash' },
      });

      const batchResult = await dispatcher.flush();
      expect(batchResult.publishedCount).toBe(1);
      expect(batchResult.dlqCount).toBe(0);
      expect(batchResult.lockAcquired).toBe(true);
    });
  });
});
