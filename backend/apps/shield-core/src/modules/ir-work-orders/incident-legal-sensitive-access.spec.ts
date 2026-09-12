import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { IncidentWorkOrderService } from './incident-work-order.service';

describe('IncidentLegalSensitiveAccess purpose-bound and privilege controls (§16.4)', () => {
  let prisma: any;
  let approvals: any;
  let service: IncidentWorkOrderService;

  const validWorkOrder = {
    id: 'wo-legal-1',
    tenant_id: 'tenant-legal-1',
    environment_id: 'prod',
    status: 'ACTIVE',
    retainer: {
      id: 'ret-1',
      legal_service_scope: JSON.stringify({
        included: false,
        counselControlled: false,
      }),
    },
  };

  beforeEach(() => {
    prisma = {
      incidentWorkOrder: {
        findFirst: jest.fn(),
      },
      incidentLegalSensitiveRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      incidentLegalAccessEvent: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    service = new IncidentWorkOrderService(prisma, approvals);
  });

  describe('listLegalSensitiveRecords (§16.4 purpose-bound access)', () => {
    it('rejects legal-sensitive record retrieval when accessReason is missing or blank', async () => {
      prisma.incidentWorkOrder.findFirst.mockResolvedValue(validWorkOrder);

      await expect(
        service.listLegalSensitiveRecords(
          'wo-legal-1',
          'tenant-legal-1',
          'prod',
          'analyst-1',
          '   ',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.incidentLegalSensitiveRecord.findMany).not.toHaveBeenCalled();
    });

    it('rejects access when work order does not belong to tenant', async () => {
      prisma.incidentWorkOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.listLegalSensitiveRecords(
          'wo-legal-1',
          'foreign-tenant',
          'prod',
          'analyst-1',
          'Regulatory inquiry response',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns records with statutory disclaimer and creates purpose-bound access audit events', async () => {
      prisma.incidentWorkOrder.findFirst.mockResolvedValue(validWorkOrder);
      const mockRecord = {
        id: 'rec-1',
        work_order_id: 'wo-legal-1',
        purpose: 'REGULATOR_INQUIRY',
        privilege_status: 'NO_PRIVILEGE_CLAIMED',
        notification_status: 'NOT_APPLICABLE',
        no_legal_advice_wording:
          'This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.',
      };
      prisma.incidentLegalSensitiveRecord.findMany.mockResolvedValue([mockRecord]);

      const results = await service.listLegalSensitiveRecords(
        'wo-legal-1',
        'tenant-legal-1',
        'prod',
        'analyst-1',
        'Formal insurer proof submission',
      );

      expect(results).toHaveLength(1);
      expect(results[0].no_legal_advice_wording).toContain(
        'does not establish legal privilege',
      );
      expect(prisma.incidentLegalAccessEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            access_reason: 'Formal insurer proof submission',
            actor_id: 'analyst-1',
            tenant_id: 'tenant-legal-1',
          }),
        ]),
      });
    });
  });

  describe('createLegalSensitiveRecord (§16.4 counsel control & privilege assertion)', () => {
    it('rejects privilege claim when retainer does not have contracted counsel control', async () => {
      prisma.incidentWorkOrder.findFirst.mockResolvedValue(validWorkOrder);

      await expect(
        service.createLegalSensitiveRecord(
          'tenant-legal-1',
          'prod',
          'analyst-1',
          {
            workOrderId: 'wo-legal-1',
            purpose: 'LEGAL_DEFENSE',
            privilegeStatus: 'COUNSEL_ASSERTED',
            notificationStatus: 'NOT_APPLICABLE',
            counselControlled: true,
            separateLegalServiceRef: 'ext-legal-contract-1',
            counselActorRef: 'counsel://external-firm',
            conclusionReference: 'memo-123',
            contentReference: 'evidence://vault/doc-1',
            accessReason: 'Privileged investigation memo',
          },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('accepts unprivileged factual technical records with mandatory statutory disclaimer', async () => {
      prisma.incidentWorkOrder.findFirst.mockResolvedValue(validWorkOrder);
      prisma.incidentLegalSensitiveRecord.create.mockResolvedValue({
        id: 'rec-created-1',
        purpose: 'INCIDENT_COORDINATION',
        privilege_status: 'NO_PRIVILEGE_CLAIMED',
        no_legal_advice_wording:
          'This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.',
      });

      const result = await service.createLegalSensitiveRecord(
        'tenant-legal-1',
        'prod',
        'analyst-1',
        {
          workOrderId: 'wo-legal-1',
          purpose: 'INCIDENT_COORDINATION',
          privilegeStatus: 'NO_PRIVILEGE_CLAIMED',
          notificationStatus: 'NOT_APPLICABLE',
          counselControlled: false,
          contentReference: 'evidence://vault/forensic-timeline',
          accessReason: 'Technical coordination between IR team and customer CISO',
        },
      );

      expect(result.id).toBe('rec-created-1');
      expect(prisma.incidentLegalSensitiveRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          no_legal_advice_wording: expect.stringContaining('does not establish legal privilege'),
          access_reason: 'Technical coordination between IR team and customer CISO',
        }),
      });
    });
  });
});
