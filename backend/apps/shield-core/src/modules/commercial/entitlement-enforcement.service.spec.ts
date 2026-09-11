import { Test, TestingModule } from '@nestjs/testing';
import {
  EntitlementEnforcementService,
  TenantQuotaContract,
} from './entitlement-enforcement.service';

describe('EntitlementEnforcementService [derived]', () => {
  let service: EntitlementEnforcementService;

  const mockContract: TenantQuotaContract = {
    tenantId: 'tenant-acme-corp',
    dailyIngestionLimitGb: 100,
    maxMonitoredAssets: 500,
    maxActiveConnectors: 10,
    softCapThresholdPercent: 100,
    hardCapThresholdPercent: 125,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntitlementEnforcementService],
    }).compile();

    service = module.get<EntitlementEnforcementService>(
      EntitlementEnforcementService,
    );
    service.resetDailyCounter(mockContract.tenantId);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return NORMAL status when ingestion is within limits', () => {
    service.recordIngestionVolume(mockContract.tenantId, 50); // 50%
    const result = service.evaluateQuota(mockContract);

    expect(result.enforcementStatus).toBe('NORMAL');
    expect(result.utilizationPercent).toBe(50);
    expect(result.meteringReceiptHash).toBeDefined();
    expect(result.meteringReceiptHash).toHaveLength(64);
  });

  it('should trigger SOFT_CAP_WARNING when utilization reaches 100%', () => {
    service.recordIngestionVolume(mockContract.tenantId, 105); // 105%
    const result = service.evaluateQuota(mockContract);

    expect(result.enforcementStatus).toBe('SOFT_CAP_WARNING');
    expect(result.utilizationPercent).toBe(105);
  });

  it('should trigger HARD_CAP_THROTTLED when utilization reaches 125%', () => {
    service.recordIngestionVolume(mockContract.tenantId, 130); // 130%
    const result = service.evaluateQuota(mockContract);

    expect(result.enforcementStatus).toBe('HARD_CAP_THROTTLED');
    expect(result.utilizationPercent).toBe(130);
  });
});
