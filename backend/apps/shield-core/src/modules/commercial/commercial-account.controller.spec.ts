import { Test, TestingModule } from '@nestjs/testing';
import {
  PlatformCommercialAccountController,
  PlatformCommercialGroupAccountController,
  TenantCommercialAccountController,
} from './commercial-account.controller';
import {
  CommercialAccountService,
  CreateCommercialAccountDto,
} from './commercial-account.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PLATFORM_SCOPE } from '../authorization/constants';
import { CommercialAccountChangeService } from './commercial-account-change.service';

describe('Commercial account controllers', () => {
  let platformController: PlatformCommercialAccountController;
  let groupController: PlatformCommercialGroupAccountController;
  let tenantController: TenantCommercialAccountController;
  let serviceMock: any;
  let changeServiceMock: any;

  const platformUser: AuthenticatedUser = {
    id: 'platform-user-1',
    sessionId: 'session-platform',
    email: 'platform@zoiko.test',
    emailVerified: true,
    assurance: 'FEDERATED_MFA',
    tenantId: PLATFORM_SCOPE,
    membershipId: 'membership-platform',
    environmentId: null,
    region: 'GLOBAL',
    policyVersion: 'v1',
    riskState: 'NORMAL',
    sessionState: 'ACTIVE',
  };
  const tenantUser: AuthenticatedUser = {
    id: 'tenant-user-1',
    sessionId: 'session-tenant',
    email: 'owner@acme.test',
    emailVerified: true,
    assurance: 'FEDERATED_MFA',
    tenantId: 'tenant-1',
    membershipId: 'membership-tenant',
    environmentId: 'prod-eu',
    region: 'EU',
    policyVersion: 'v1',
    riskState: 'NORMAL',
    sessionState: 'ACTIVE',
  };

  beforeEach(async () => {
    serviceMock = {
      createCommercialAccount: jest.fn(),
      createGroupAccount: jest.fn(),
      createBinding: jest.fn(),
      updateBindingStatus: jest.fn(),
      listCommercialAccountsForTenant: jest.fn(),
      getCommercialAccountForTenant: jest.fn(),
      getBindingsForTenant: jest.fn(),
      getGroupSummaryForTenant: jest.fn(),
    };
    changeServiceMock = {
      requestChange: jest.fn(),
      listChanges: jest.fn(),
      decideChange: jest.fn(),
      applyChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        PlatformCommercialAccountController,
        PlatformCommercialGroupAccountController,
        TenantCommercialAccountController,
      ],
      providers: [
        { provide: CommercialAccountService, useValue: serviceMock },
        {
          provide: CommercialAccountChangeService,
          useValue: changeServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformPermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    platformController = module.get(PlatformCommercialAccountController);
    groupController = module.get(PlatformCommercialGroupAccountController);
    tenantController = module.get(TenantCommercialAccountController);
  });

  it('passes the authenticated platform actor into account creation', async () => {
    const dto: CreateCommercialAccountDto = {
      name: 'Acme',
      customerLegalName: 'Acme Limited',
      billingAddress: {
        line1: '1 Main Street',
        city: 'London',
        postalCode: 'SW1A 1AA',
        countryCode: 'GB',
      },
      taxFacts: { countryCode: 'GB' },
      currency: 'GBP',
      contacts: [
        { type: 'BILLING', name: 'Pat Lee', email: 'billing@acme.test' },
      ],
      billingSource: 'DIRECT',
    };
    serviceMock.createCommercialAccount.mockResolvedValue({ id: 'account-1' });

    const result = await platformController.createCommercialAccount(
      dto,
      platformUser,
    );

    expect(result.statusCode).toBe(201);
    expect(serviceMock.createCommercialAccount).toHaveBeenCalledWith(
      dto,
      'platform-user-1',
    );
  });

  it('scopes account reads to the session tenant and environment', async () => {
    serviceMock.getCommercialAccountForTenant.mockResolvedValue({
      id: 'account-1',
    });

    await tenantController.getCommercialAccount(
      'account-1',
      'tenant-1',
      tenantUser,
    );

    expect(serviceMock.getCommercialAccountForTenant).toHaveBeenCalledWith(
      'account-1',
      'tenant-1',
      'prod-eu',
    );
  });

  it('passes the authenticated platform actor into group-account creation', async () => {
    serviceMock.createGroupAccount.mockResolvedValue({ id: 'group-1' });

    await groupController.createGroupAccount(
      { name: 'Acme Group', customerLegalName: 'Acme Holdings plc' },
      platformUser,
    );

    expect(serviceMock.createGroupAccount).toHaveBeenCalledWith(
      { name: 'Acme Group', customerLegalName: 'Acme Holdings plc' },
      'platform-user-1',
    );
  });

  it('scopes group summaries to the session tenant and environment', async () => {
    serviceMock.getGroupSummaryForTenant.mockResolvedValue({ id: 'group-1' });

    await tenantController.getGroupSummary('account-1', 'tenant-1', tenantUser);

    expect(serviceMock.getGroupSummaryForTenant).toHaveBeenCalledWith(
      'account-1',
      'tenant-1',
      'prod-eu',
    );
  });
});
