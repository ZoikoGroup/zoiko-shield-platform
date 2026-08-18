import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuthorizationDecisionService } from '../authorization-decision/authorization-decision.service';

describe('TenantController', () => {
  let controller: TenantController;
  let tenantServiceMock: any;
  let authServiceMock: any;

  beforeEach(async () => {
    tenantServiceMock = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      transitionStatus: jest.fn(),
    };

    authServiceMock = {
      getPermissionCodesForPrincipal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: tenantServiceMock },
        { provide: AuthorizationService, useValue: authServiceMock },
        {
          provide: AuthorizationDecisionService,
          useValue: {
            evaluate: jest.fn().mockResolvedValue({ decision: 'PERMIT' }),
          },
        },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
