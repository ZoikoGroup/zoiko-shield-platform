import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventNotificationConsumer } from './domain-event-notification.consumer';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { NotificationDispatchService } from '../dispatch/notification-dispatch.service';

describe('DomainEventNotificationConsumer (Spec §12 & ZS-EML-TPL-001)', () => {
  let consumer: DomainEventNotificationConsumer;
  let kafkaConsumerMock: {
    registerHandler: jest.Mock;
  };
  let dispatchServiceMock: {
    dispatch: jest.Mock;
  };

  const registeredHandlers = new Map<string, (envelope: any) => Promise<void>>();

  beforeEach(async () => {
    registeredHandlers.clear();
    kafkaConsumerMock = {
      registerHandler: jest.fn((topic, handler) => {
        registeredHandlers.set(topic, handler);
      }),
    };
    dispatchServiceMock = {
      dispatch: jest.fn().mockResolvedValue({ status: 'DELIVERED', notificationId: 'ntf-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventNotificationConsumer,
        { provide: KafkaConsumerService, useValue: kafkaConsumerMock },
        { provide: NotificationDispatchService, useValue: dispatchServiceMock },
      ],
    }).compile();

    consumer = module.get<DomainEventNotificationConsumer>(
      DomainEventNotificationConsumer,
    );
    consumer.onModuleInit();
  });

  it('should register all high-priority domain event handlers on module init', () => {
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'audit_package.frozen.v1',
      expect.any(Function),
    );
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'alert.critical.v1',
      expect.any(Function),
    );
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'soar.dual_custody_approval.requested.v1',
      expect.any(Function),
    );
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'billing.quota_threshold.v1',
      expect.any(Function),
    );
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'jit.elevation_requested.v1',
      expect.any(Function),
    );
    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith(
      'incident.declared.v1',
      expect.any(Function),
    );
  });

  it('should dispatch notification when alert.critical.v1 event fires', async () => {
    const handler = registeredHandlers.get('alert.critical.v1');
    expect(handler).toBeDefined();

    await handler!({
      eventId: 'evt-alrt-001',
      correlationId: 'corr-001',
      payload: {
        alertId: 'ALT-9901',
        tenantId: 'tenant-acme',
        title: 'Unauthorized IAM Escalation Detected',
        severity: 'CRITICAL',
      },
    });

    expect(dispatchServiceMock.dispatch).toHaveBeenCalledWith({
      tenantId: 'tenant-acme',
      eventId: 'evt-alrt-001',
      eventType: 'CRITICAL_ALERT_DETECTED',
      recipientPrincipalId: 'soc-lead',
      templateContext: {
        alertId: 'ALT-9901',
        title: 'Unauthorized IAM Escalation Detected',
        severity: 'CRITICAL',
      },
      correlationId: 'corr-001',
    });
  });

  it('should dispatch notification when soar.dual_custody_approval.requested.v1 event fires', async () => {
    const handler = registeredHandlers.get('soar.dual_custody_approval.requested.v1');
    expect(handler).toBeDefined();

    await handler!({
      eventId: 'evt-appr-001',
      correlationId: 'corr-002',
      payload: {
        approvalId: 'appr-7721',
        tenantId: 'tenant-acme',
        actionType: 'REVOKE_GCP_SA_KEY',
        targetRef: 'sa-deployer@zoiko.iam.gserviceaccount.com',
      },
    });

    expect(dispatchServiceMock.dispatch).toHaveBeenCalledWith({
      tenantId: 'tenant-acme',
      eventId: 'evt-appr-001',
      eventType: 'TWO_MAN_APPROVAL_REQUIRED',
      recipientPrincipalId: 'security-officer',
      templateContext: {
        approvalId: 'appr-7721',
        actionType: 'REVOKE_GCP_SA_KEY',
        targetRef: 'sa-deployer@zoiko.iam.gserviceaccount.com',
      },
      correlationId: 'corr-002',
    });
  });

  it('should dispatch notification when billing.quota_threshold.v1 event fires', async () => {
    const handler = registeredHandlers.get('billing.quota_threshold.v1');
    expect(handler).toBeDefined();

    await handler!({
      eventId: 'evt-usg-001',
      correlationId: 'corr-003',
      payload: {
        tenantId: 'tenant-acme',
        consumedGb: 920,
        limitGb: 1000,
        percentage: 92,
      },
    });

    expect(dispatchServiceMock.dispatch).toHaveBeenCalledWith({
      tenantId: 'tenant-acme',
      eventId: 'evt-usg-001',
      eventType: 'USAGE_QUOTA_THRESHOLD_EXCEEDED',
      recipientPrincipalId: 'billing-admin',
      templateContext: {
        consumedGb: '920',
        limitGb: '1000',
        percentage: '92%',
      },
      correlationId: 'corr-003',
    });
  });
});
