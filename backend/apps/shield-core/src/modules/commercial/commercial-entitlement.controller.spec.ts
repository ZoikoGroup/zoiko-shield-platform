import { Test, TestingModule } from '@nestjs/testing';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { ClaimRegisterService } from './claim-register.service';

describe('CommercialEntitlementController', () => {
  let controller: CommercialEntitlementController;
  let serviceMock: any;
  let claimRegisterMock: any;

  beforeEach(async () => {
    serviceMock = {
      grantEntitlement: jest.fn(),
      getEntitlementsByTenant: jest.fn(),
      checkEntitlement: jest.fn(),
    };
    claimRegisterMock = { verifyClaimEligibility: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommercialEntitlementController],
      providers: [
        { provide: CommercialEntitlementService, useValue: serviceMock },
        { provide: ClaimRegisterService, useValue: claimRegisterMock },
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

  it('should check entitlement (fail closed)', async () => {
    serviceMock.checkEntitlement.mockResolvedValue(false);

    const response = await controller.checkEntitlement('tenant-1', {
      offerType: 'AI_SECURITY',
    });

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data.isEntitled).toBe(false);
  });
});
