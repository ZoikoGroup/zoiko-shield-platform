import { Test, TestingModule } from '@nestjs/testing';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('CommercialEntitlementController', () => {
  let controller: CommercialEntitlementController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createCommercialAccount: jest.fn(),
      getCommercialAccountById: jest.fn(),
      grantEntitlement: jest.fn(),
      getEntitlementsByTenant: jest.fn(),
      checkEntitlement: jest.fn(),
      registerClaim: jest.fn(),
      verifyClaimEligibility: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommercialEntitlementController],
      providers: [
        { provide: CommercialEntitlementService, useValue: serviceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommercialEntitlementController>(
      CommercialEntitlementController,
    );
  });

  it('should return created commercial account', async () => {
    const mockAccount = { id: 'comm-1', name: 'Acme' };
    serviceMock.createCommercialAccount.mockResolvedValue(mockAccount);

    const response = await controller.createCommercialAccount({ name: 'Acme' });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockAccount);
  });

  it('should check entitlement (fail closed)', async () => {
    serviceMock.checkEntitlement.mockResolvedValue(false);

    const response = await controller.checkEntitlement('tenant-1', {
      offerType: 'AI_SECURITY',
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data.isEntitled).toBe(false);
  });
});
