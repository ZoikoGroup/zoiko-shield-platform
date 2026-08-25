import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { EvaluationProgramService } from './evaluation-program.service';

describe('EvaluationProgramService (Category B3)', () => {
  let service: EvaluationProgramService;
  let prisma: any;
  let approvals: any;

  const program = {
    id: 'program-1',
    program_key: 'pilot-acme-001',
    program_type: 'PILOT',
    commercial_account_id: '8fb42445-f424-4c96-9845-3188c8ac04af',
    tenant_id: 'tenant-1',
    environment_id: 'prod-eu',
    region: 'EU',
    starts_at: new Date(Date.now() - 60_000),
    ends_at: new Date(Date.now() + 3_600_000),
    data_classes: JSON.stringify(['security-telemetry']),
    connector_scope: JSON.stringify(['m365']),
    entitlement_scope: JSON.stringify(['MANAGED_DEFENSE']),
    service_coverage: JSON.stringify(['business-hours']),
    response_authority: 'RECOMMEND',
    payment_requirement: 'NOT_REQUIRED',
    payment_reference_id: null,
    conversion_policy: 'REQUIRE_APPROVED_ORDER',
    expiry_action: 'REVOKE_ENTITLEMENTS',
    status: 'APPROVED',
    approval_id: 'approval-1',
    requested_by: 'maker-1',
    entitlements: [],
  };

  beforeEach(async () => {
    prisma = {
      evaluationProgram: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialAccount: { findUnique: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      payment: { findFirst: jest.fn() },
      entitlement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      commercialApproval: { update: jest.fn() },
      commercialOrder: { findUnique: jest.fn() },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    approvals = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        EvaluationProgramService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
      ],
    }).compile();
    service = module.get(EvaluationProgramService);
  });

  it('rejects an unrestricted program with an empty governed scope', async () => {
    await expect(
      service.createProgram(
        {
          programKey: 'unbounded',
          programType: 'EVALUATION',
          commercialAccountId: '8fb42445-f424-4c96-9845-3188c8ac04af',
          tenantId: 'tenant-1',
          environmentId: 'prod-eu',
          region: 'EU',
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 86_400_000),
          dataClasses: [],
          connectorScope: ['m365'],
          entitlementScope: ['MANAGED_DEFENSE'],
          serviceCoverage: ['business-hours'],
          responseAuthority: 'OBSERVE',
          paymentRequirement: 'NOT_REQUIRED',
          conversionPolicy: 'EXPIRE',
        },
        'maker-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates only an explicitly bounded DRAFT program', async () => {
    prisma.commercialAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.evaluationProgram.create.mockResolvedValue({
      id: 'program-1',
      status: 'DRAFT',
    });

    const result = await service.createProgram(
      {
        programKey: 'pilot-acme-001',
        programType: 'PILOT',
        commercialAccountId: '8fb42445-f424-4c96-9845-3188c8ac04af',
        tenantId: 'tenant-1',
        environmentId: 'prod-eu',
        region: 'EU',
        startsAt: new Date(Date.now() + 1_000),
        endsAt: new Date(Date.now() + 86_400_000),
        dataClasses: ['security-telemetry'],
        connectorScope: ['m365'],
        entitlementScope: ['MANAGED_DEFENSE'],
        serviceCoverage: ['business-hours'],
        responseAuthority: 'RECOMMEND',
        paymentRequirement: 'NOT_REQUIRED',
        conversionPolicy: 'REQUIRE_APPROVED_ORDER',
      },
      'maker-1',
    );

    expect(result.status).toBe('DRAFT');
    expect(prisma.evaluationProgram.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expiry_action: 'REVOKE_ENTITLEMENTS',
        status: 'DRAFT',
        requested_by: 'maker-1',
      }),
    });
  });

  it('requires a settled payment when the approved program says payment first', async () => {
    prisma.evaluationProgram.findUnique.mockResolvedValue({
      ...program,
      payment_requirement: 'REQUIRED_BEFORE_ACTIVATION',
      payment_reference_id: 'payment-1',
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.activateProgram('program-1', 'operator-1'),
    ).rejects.toThrow('not SETTLED');
  });

  it('activates source-tagged entitlements only after approval', async () => {
    prisma.evaluationProgram.findUnique.mockResolvedValue(program);
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.entitlement.findFirst.mockResolvedValue(null);
    prisma.evaluationProgram.update.mockResolvedValue({
      id: 'program-1',
      status: 'ACTIVE',
    });

    await service.activateProgram('program-1', 'operator-1');

    expect(prisma.entitlement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          offer_type: 'MANAGED_DEFENSE',
          source_type: 'EVALUATION_PROGRAM',
          evaluation_program_id: 'program-1',
          effective_to: program.ends_at,
        }),
      ],
    });
    expect(prisma.commercialApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPLIED' }),
      }),
    );
  });

  it('expires program entitlements without deleting commercial history', async () => {
    prisma.evaluationProgram.findUnique.mockResolvedValue({
      ...program,
      status: 'ACTIVE',
    });
    prisma.evaluationProgram.update.mockResolvedValue({
      id: 'program-1',
      status: 'EXPIRED',
    });

    await service.expireProgram('program-1');

    expect(prisma.entitlement.updateMany).toHaveBeenCalledWith({
      where: { evaluation_program_id: 'program-1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
    expect(prisma.evaluationProgram.update).toHaveBeenCalledWith({
      where: { id: 'program-1' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
  });

  it('expires an unactivated approved program after its hard end', async () => {
    prisma.evaluationProgram.findUnique.mockResolvedValue({
      ...program,
      status: 'APPROVED',
      ends_at: new Date(Date.now() - 1_000),
    });
    prisma.evaluationProgram.update.mockResolvedValue({
      id: 'program-1',
      status: 'EXPIRED',
    });

    await expect(service.expireProgram('program-1')).resolves.toMatchObject({
      status: 'EXPIRED',
    });
    expect(prisma.entitlement.updateMany).toHaveBeenCalled();
  });

  it('rejects conversion until normal replacement entitlements cover the pilot', async () => {
    prisma.evaluationProgram.findUnique.mockResolvedValue({
      ...program,
      status: 'ACTIVE',
    });
    prisma.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      commercial_account_id: program.commercial_account_id,
      tenant_id: program.tenant_id,
    });
    prisma.entitlement.findMany.mockResolvedValue([]);

    await expect(
      service.convertProgram('program-1', 'order-1', 'operator-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
