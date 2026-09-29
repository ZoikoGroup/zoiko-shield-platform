import { Test, TestingModule } from '@nestjs/testing';
import { AirgapComplianceController } from './airgap-compliance.controller';
import { AirgapCompliancePackageService } from './airgap-compliance-package.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';

describe('AirgapComplianceController', () => {
  let controller: AirgapComplianceController;
  let service: AirgapCompliancePackageService;

  beforeEach(async () => {
    const mockService = {
      exportAirgapPackage: jest.fn().mockResolvedValue({
        bundleId: 'airgap-bundle-01',
        packageId: 'pkg-01',
        formatVersion: 'ZOIKO-AIRGAP-V1',
        packageArchiveBase64: 'YmFzZTY0ZGF0YQ==',
      }),
      getAirgapBundle: jest.fn().mockResolvedValue({
        bundleId: 'airgap-bundle-01',
        packageId: 'pkg-01',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AirgapComplianceController],
      providers: [
        {
          provide: AirgapCompliancePackageService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AirgapComplianceController>(
      AirgapComplianceController,
    );
    service = module.get<AirgapCompliancePackageService>(
      AirgapCompliancePackageService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should export airgap package', async () => {
    const res = await controller.exportPackage(
      '11111111-1111-1111-1111-111111111111',
      { packageId: 'pkg-01' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.data.bundleId).toBe('airgap-bundle-01');
  });
});
