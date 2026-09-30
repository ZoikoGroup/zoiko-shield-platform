import { Test, TestingModule } from '@nestjs/testing';
import { MsspFleetPostureService } from './mssp-fleet-posture.service';

describe('MsspFleetPostureService', () => {
  let service: MsspFleetPostureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MsspFleetPostureService],
    }).compile();

    service = module.get<MsspFleetPostureService>(MsspFleetPostureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate multi-tenant fleet posture summary for MSSP partner', () => {
    const summary = service.getFleetPostureSummary('partner-mssp-global-01');

    expect(summary.msspPartnerId).toBe('partner-mssp-global-01');
    expect(summary.totalDelegatedTenants).toBe(3);
    expect(summary.delegatedTenants.length).toBe(3);
    expect(summary.averageComplianceScorePercent).toBeGreaterThanOrEqual(90);
  });

  it('should verify cross-tenant isolation and report zero leakage', () => {
    const audit = service.verifyCrossTenantIsolation('partner-mssp-global-01');

    expect(audit.allBoundariesSealed).toBe(true);
    expect(audit.crossTenantLeakageDetected).toBe(false);
    expect(audit.verifiedTenantsCount).toBe(3);
    expect(audit.isolationTestId).toBeDefined();
  });
});
