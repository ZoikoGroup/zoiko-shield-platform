import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalService } from '../identity-adapter/principal.service';
import { SessionService } from '../identity-adapter/session.service';
import { PartnerService } from './partner.service';

describe('PartnerService authoritative principal contexts', () => {
  let service: PartnerService;
  let prismaMock: any;
  let principalMock: any;
  let sessionMock: any;

  beforeEach(async () => {
    prismaMock = {
      partner: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'partner-1',
          managing_organization_id: 'mssp-org-1',
        }),
      },
      partnerPrincipalContext: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      partnerDelegation: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    principalMock = {
      findById: jest.fn().mockResolvedValue({
        id: 'partner-user-1',
        status: 'ACTIVE',
      }),
    };
    sessionMock = {
      revokeAllForPrincipal: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PrincipalService, useValue: principalMock },
        { provide: SessionService, useValue: sessionMock },
      ],
    }).compile();
    service = module.get(PartnerService);
  });

  it('derives managing-organization authority from the active partner record', async () => {
    prismaMock.partnerPrincipalContext.create.mockImplementation(
      ({ data }: any) => ({ id: 'context-1', ...data }),
    );

    const context = await service.createPrincipalContext(
      'partner-1',
      'platform-admin',
      { principalId: 'partner-user-1' },
    );

    expect(context.managing_organization_id).toBe('mssp-org-1');
    expect(prismaMock.partnerPrincipalContext.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partner_id: 'partner-1',
        principal_id: 'partner-user-1',
        managing_organization_id: 'mssp-org-1',
        created_by: 'platform-admin',
      }),
    });
  });

  it('prevents one principal from being bound to a second managing organization', async () => {
    prismaMock.partnerPrincipalContext.findUnique.mockResolvedValue({
      id: 'context-existing',
      partner_id: 'partner-2',
    });

    await expect(
      service.createPrincipalContext('partner-1', 'platform-admin', {
        principalId: 'partner-user-1',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.partnerPrincipalContext.create).not.toHaveBeenCalled();
  });

  it('deactivation revokes every active grant and every session for the partner principal', async () => {
    prismaMock.partnerPrincipalContext.findFirst.mockResolvedValue({
      id: 'context-1',
      partner_id: 'partner-1',
      principal_id: 'partner-user-1',
      status: 'ACTIVE',
    });
    prismaMock.partnerDelegation.findMany.mockResolvedValue([
      { id: 'delegation-1', tenant_id: 'tenant-1' },
      { id: 'delegation-2', tenant_id: 'tenant-2' },
    ]);
    prismaMock.partnerPrincipalContext.update.mockImplementation(
      ({ data }: any) => ({
        id: 'context-1',
        principal_id: 'partner-user-1',
        ...data,
      }),
    );

    await service.deactivatePrincipalContext(
      'partner-1',
      'context-1',
      'platform-admin',
      'Supplier offboarded',
    );

    expect(prismaMock.partnerDelegation.updateMany).toHaveBeenCalledWith({
      where: {
        partner_principal_context_id: 'context-1',
        status: 'ACTIVE',
      },
      data: expect.objectContaining({
        status: 'REVOKED',
        revoked_by: 'platform-admin',
      }),
    });
    expect(sessionMock.revokeAllForPrincipal).toHaveBeenCalledWith(
      'partner-user-1',
      'PARTNER_PRINCIPAL_CONTEXT_DEACTIVATED',
    );
  });
});
