import { Test, TestingModule } from '@nestjs/testing';
import { SectorComplianceController } from './sector-compliance.controller';
import { DoraComplianceEvaluatorService } from './dora-compliance-evaluator.service';
import { Nis2ComplianceEvaluatorService } from './nis2-compliance-evaluator.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';

describe('SectorComplianceController', () => {
  let controller: SectorComplianceController;
  let doraService: DoraComplianceEvaluatorService;
  let nis2Service: Nis2ComplianceEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SectorComplianceController],
      providers: [
        DoraComplianceEvaluatorService,
        Nis2ComplianceEvaluatorService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SectorComplianceController>(
      SectorComplianceController,
    );
    doraService = module.get<DoraComplianceEvaluatorService>(
      DoraComplianceEvaluatorService,
    );
    nis2Service = module.get<Nis2ComplianceEvaluatorService>(
      Nis2ComplianceEvaluatorService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should evaluate DORA posture and return 200 with report', () => {
    const user = {
      id: 'usr-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentId: 'env-prod-01',
    } as any;

    const res = controller.evaluateDora(
      '00000000-0000-0000-0000-000000000001',
      user,
      {
        multiCloudRecoveryRtoMinutes: 30,
        multiCloudRecoveryRpoMinutes: 0,
        boundaryDefenseMfaRate: 1.0,
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.framework).toBe('DORA_EU_2022_2554');
    expect(res.data.merkleEvidenceRoot).toBeDefined();
  });

  it('should evaluate NIS2 posture and return 200 with report', () => {
    const user = {
      id: 'usr-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentId: 'env-prod-01',
    } as any;

    const res = controller.evaluateNis2(
      '00000000-0000-0000-0000-000000000001',
      user,
      {
        entityType: 'ESSENTIAL_ENTITY',
        incidentHandlingProcessDocumented: true,
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.framework).toBe('NIS2_DIRECTIVE_EU_2022_2555');
  });

  it('should return sector summary for DORA and NIS2', () => {
    const user = {
      id: 'usr-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      environmentId: 'env-prod-01',
    } as any;

    const res = controller.getSectorSummary(
      '00000000-0000-0000-0000-000000000001',
      user,
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.frameworks.DORA).toBeDefined();
    expect(res.data.frameworks.NIS2).toBeDefined();
  });
});
