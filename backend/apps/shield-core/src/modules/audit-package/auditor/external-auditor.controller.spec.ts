import { Test, TestingModule } from '@nestjs/testing';
import { ExternalAuditorController } from './external-auditor.controller';
import { ExternalAuditorWorkspaceService } from './external-auditor-workspace.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';

describe('ExternalAuditorController', () => {
  let controller: ExternalAuditorController;
  let service: ExternalAuditorWorkspaceService;

  beforeEach(async () => {
    const mockService = {
      getAuditorWorkspaceSummary: jest.fn().mockResolvedValue({
        auditorRole: 'AUDITOR_EXTERNAL',
        totalAuditPackages: 5,
      }),
      getMerklePathProof: jest.fn().mockResolvedValue({
        leafHash: 'leaf-1',
        isRootVerified: true,
      }),
      getEvidenceChain: jest.fn().mockResolvedValue({
        packageId: 'pkg-1',
        chainIntegrityVerified: true,
      }),
      generateImmutableFreezeCertificate: jest.fn().mockResolvedValue({
        certificateId: 'cert-1',
        freezeStatus: 'IMMUTABLE_FROZEN_NOTARIZED',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalAuditorController],
      providers: [
        {
          provide: ExternalAuditorWorkspaceService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExternalAuditorController>(
      ExternalAuditorController,
    );
    service = module.get<ExternalAuditorWorkspaceService>(
      ExternalAuditorWorkspaceService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return auditor workspace summary', async () => {
    const res = await controller.getWorkspaceSummary(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(res.statusCode).toBe(200);
    expect(res.data.auditorRole).toBe('AUDITOR_EXTERNAL');
  });

  it('should return Merkle path proof', async () => {
    const res = await controller.getMerklePath(
      '11111111-1111-1111-1111-111111111111',
      'leaf-hash-1',
    );
    expect(res.statusCode).toBe(200);
    expect(res.data.isRootVerified).toBe(true);
  });

  it('should generate freeze certificate', async () => {
    const res = await controller.generateFreezeCertificate(
      '11111111-1111-1111-1111-111111111111',
      'pkg-1',
    );
    expect(res.statusCode).toBe(200);
    expect(res.data.freezeStatus).toBe('IMMUTABLE_FROZEN_NOTARIZED');
  });
});
