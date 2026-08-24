import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { CorporateTransferController } from './corporate-transfer.controller';
import { CorporateTransferService } from './corporate-transfer.service';
import type { CreateCorporateTransferDto } from './corporate-transfer.service';

describe('CorporateTransferController', () => {
  let controller: CorporateTransferController;
  let serviceMock: any;

  const user: AuthenticatedUser = {
    id: 'actor-1',
    sessionId: 'session-1',
    email: 'owner@acme.test',
    emailVerified: true,
    assurance: 'FEDERATED_MFA',
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    environmentId: 'prod-eu',
    region: 'EU',
    policyVersion: 'v1',
    riskState: 'NORMAL',
    sessionState: 'ACTIVE',
  };

  beforeEach(async () => {
    serviceMock = {
      requestTransfer: jest.fn(),
      listForParticipant: jest.fn(),
      decideTransfer: jest.fn(),
      executeTransfer: jest.fn(),
      reconcileTransfer: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CorporateTransferController],
      providers: [{ provide: CorporateTransferService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CorporateTransferController);
  });

  it('derives the source tenant, environment and requester from the authenticated session', async () => {
    const request = {
      sourceCommercialAccountId: 'source-account',
    } as CreateCorporateTransferDto;
    serviceMock.requestTransfer.mockResolvedValue({ id: 'transfer-1' });

    await controller.requestTransfer('tenant-1', user, request);

    expect(serviceMock.requestTransfer).toHaveBeenCalledWith(
      'tenant-1',
      'prod-eu',
      'actor-1',
      request,
    );
  });

  it('derives the participant boundary for decisions', async () => {
    serviceMock.decideTransfer.mockResolvedValue({ id: 'transfer-1' });

    await controller.decideTransfer('transfer-1', 'tenant-1', user, {
      decision: 'APPROVED',
      reason: 'Accepted',
    });

    expect(serviceMock.decideTransfer).toHaveBeenCalledWith(
      'transfer-1',
      'tenant-1',
      'prod-eu',
      'actor-1',
      { decision: 'APPROVED', reason: 'Accepted' },
    );
  });

  it('executes only as the authenticated source actor', async () => {
    serviceMock.executeTransfer.mockResolvedValue({ id: 'transfer-1' });

    await controller.executeTransfer('transfer-1', 'tenant-1', user);

    expect(serviceMock.executeTransfer).toHaveBeenCalledWith(
      'transfer-1',
      'tenant-1',
      'prod-eu',
      'actor-1',
    );
  });

  it('reconciles as the authenticated target participant', async () => {
    serviceMock.reconcileTransfer.mockResolvedValue({ id: 'transfer-1' });

    await controller.reconcileTransfer('transfer-1', 'tenant-1', user, {
      outcome: 'PASS',
      notes: 'Target controls verified',
    });

    expect(serviceMock.reconcileTransfer).toHaveBeenCalledWith(
      'transfer-1',
      'tenant-1',
      'prod-eu',
      'actor-1',
      { outcome: 'PASS', notes: 'Target controls verified' },
    );
  });
});
