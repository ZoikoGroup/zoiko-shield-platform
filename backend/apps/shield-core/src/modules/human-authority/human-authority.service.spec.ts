import { ForbiddenException } from '@nestjs/common';
import { HumanAuthorityService } from './human-authority.service';

describe('HumanAuthorityService (Category H protected decisions)', () => {
  let prisma: any;
  let service: HumanAuthorityService;

  const base = {
    tenantId: 'tenant-1',
    environmentId: 'prod',
    actionClass: 'REFUND_AUTHORIZATION' as const,
    resourceType: 'Payment',
    resourceId: 'payment-1',
    actorId: 'human-1',
  };

  beforeEach(() => {
    prisma = {
      aiHumanAuthorityDecision: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'authority-1',
          ...data,
        })),
      },
      aiOutput: { findFirst: jest.fn() },
      aiHumanReview: { findFirst: jest.fn() },
    };
    service = new HumanAuthorityService(prisma);
  });

  it('fails closed and records a denial when the attestation is missing', async () => {
    await expect(service.authorize(base)).rejects.toThrow(ForbiddenException);
    expect(prisma.aiHumanAuthorityDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision_origin: 'MISSING',
        human_confirmation: false,
        decision: 'DENY',
      }),
    });
  });

  it('fails closed on malformed pre-validation attestation values', async () => {
    await expect(
      service.authorize({
        ...base,
        decisionOrigin: 'AI_GENERATED' as any,
        humanConfirmation: true,
        authorityStatement: 42 as any,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.aiOutput.findFirst).not.toHaveBeenCalled();
  });

  it('permits an explicit authenticated-human decision without AI evidence', async () => {
    const receipt = await service.authorize({
      ...base,
      decisionOrigin: 'HUMAN',
      humanConfirmation: true,
      authorityStatement: 'I independently authorize this refund decision.',
    });

    expect(receipt).toEqual(
      expect.objectContaining({ decision: 'PERMIT', decision_origin: 'HUMAN' }),
    );
    expect(prisma.aiOutput.findFirst).not.toHaveBeenCalled();
  });

  it('rejects autonomous AI authority before consulting output evidence', async () => {
    await expect(
      service.authorize({
        ...base,
        decisionOrigin: 'AI_AUTONOMOUS',
        humanConfirmation: true,
        authorityStatement: 'The AI autonomously authorized this decision.',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.aiOutput.findFirst).not.toHaveBeenCalled();
    expect(prisma.aiHumanAuthorityDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ decision: 'DENY' }),
    });
  });

  it('permits AI-assisted authority only with the exact safe reviewed output', async () => {
    prisma.aiOutput.findFirst.mockResolvedValue({
      id: '8f9b2daa-a3c8-4385-99b8-9689db2d7d48',
      safety_result: 'PASSED',
    });
    prisma.aiHumanReview.findFirst.mockResolvedValue({
      id: 'c0726d05-d7a7-41d8-9ac7-b94254319953',
      decision: 'APPROVED',
    });

    const receipt = await service.authorize({
      ...base,
      decisionOrigin: 'AI_ASSISTED',
      humanConfirmation: true,
      authorityStatement:
        'I reviewed the evidence and authorize this decision.',
      aiOutputId: '8f9b2daa-a3c8-4385-99b8-9689db2d7d48',
      aiHumanReviewId: 'c0726d05-d7a7-41d8-9ac7-b94254319953',
    });

    expect(receipt).toEqual(
      expect.objectContaining({
        decision: 'PERMIT',
        decision_origin: 'AI_ASSISTED',
      }),
    );
    expect(prisma.aiOutput.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenant_id: 'tenant-1',
        environment_id: 'prod',
      }),
    });
  });

  it('denies cross-tenant or unreviewed AI evidence and records the attempt', async () => {
    prisma.aiOutput.findFirst.mockResolvedValue(null);
    prisma.aiHumanReview.findFirst.mockResolvedValue(null);

    await expect(
      service.authorize({
        ...base,
        decisionOrigin: 'AI_ASSISTED',
        humanConfirmation: true,
        authorityStatement:
          'I reviewed the evidence and authorize this decision.',
        aiOutputId: '8f9b2daa-a3c8-4385-99b8-9689db2d7d48',
        aiHumanReviewId: 'c0726d05-d7a7-41d8-9ac7-b94254319953',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.aiHumanAuthorityDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ decision: 'DENY' }),
    });
  });

  it('denies pending or rejected AI safety results even after a human review', async () => {
    prisma.aiOutput.findFirst.mockResolvedValue({
      id: '8f9b2daa-a3c8-4385-99b8-9689db2d7d48',
      safety_result: 'REJECTED',
    });
    prisma.aiHumanReview.findFirst.mockResolvedValue({
      id: 'c0726d05-d7a7-41d8-9ac7-b94254319953',
      decision: 'APPROVED',
    });

    await expect(
      service.authorize({
        ...base,
        decisionOrigin: 'AI_ASSISTED',
        humanConfirmation: true,
        authorityStatement:
          'I reviewed the evidence and authorize this decision.',
        aiOutputId: '8f9b2daa-a3c8-4385-99b8-9689db2d7d48',
        aiHumanReviewId: 'c0726d05-d7a7-41d8-9ac7-b94254319953',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
