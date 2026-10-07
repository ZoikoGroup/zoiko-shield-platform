import { NotificationAuditReconstructionService } from './notification-audit-reconstruction.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('NotificationAuditReconstructionService (ZS-EML-TPL-001 v2.0 Gate 11)', () => {
  let service: NotificationAuditReconstructionService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      notificationDelivery: {
        findUnique: jest.fn(),
      },
    };
    service = new NotificationAuditReconstructionService(prismaMock as PrismaService);
  });

  it('should generate a deterministic audit manifest and SHA-256 audit hash', () => {
    const manifest = service.createAuditManifest({
      deliveryId: 'del-101',
      tenantId: 'tenant-acme',
      eventId: 'evt-sec-01',
      eventVersion: 1,
      templateId: 'ZS-EML-SEC-001',
      templateVersion: 2,
      policyId: 'pol-critical-alerts',
      policyVersion: 1,
      recipientEmail: 'operator@acme.com',
      renderHash: 'hash-abc-123',
      contentDigest: 'digest-xyz-789',
      senderClass: 'security_sender',
      dispatchedAt: '2026-10-07T12:00:00.000Z',
    });

    expect(manifest.auditHash).toBeDefined();
    expect(manifest.auditHash).toHaveLength(64);
    expect(manifest.recipientHash).toBeDefined();
    expect(manifest.recipientHash).not.toContain('operator@acme.com'); // PII hashed
  });

  it('should verify delivery integrity against stored database records', async () => {
    const mockDate = new Date('2026-10-07T12:00:00.000Z');
    prismaMock.notificationDelivery.findUnique.mockResolvedValue({
      id: 'del-101',
      tenant_id: 'tenant-acme',
      event_id: 'evt-sec-01',
      policy_id: 'pol-critical-alerts',
      policy_version: 1,
      template_version: 2,
      channel: 'EMAIL',
      correlation_id: 'corr-999',
      created_at: mockDate,
    });

    const result = await service.verifyDeliveryIntegrity('del-101', 'operator@acme.com');
    expect(result.verified).toBe(true);
    expect(result.tamperDetected).toBe(false);
    expect(result.reconstructedAuditHash).toBeDefined();
  });
});
