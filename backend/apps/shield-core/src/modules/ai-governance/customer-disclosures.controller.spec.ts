import { Test, TestingModule } from '@nestjs/testing';
import { CustomerDisclosuresController } from './customer-disclosures.controller';

describe('CustomerDisclosuresController', () => {
  let controller: CustomerDisclosuresController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerDisclosuresController],
    }).compile();

    controller = module.get<CustomerDisclosuresController>(
      CustomerDisclosuresController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns valid customer disclosures declaring G1 pending status, R1 authority, and ADR-08 deferral', () => {
    const disclosures = controller.getDisclosures();

    expect(disclosures.g1LaunchGateStatus).toBe(
      'PENDING MULTI-APPROVER SIGN-OFF',
    );
    expect(disclosures.responseAuthorityLevel).toBe(
      'R1_RECOMMEND_AND_SIMULATE_ONLY',
    );
    expect(disclosures.regulatoryBoundary.deferredOverlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ framework: 'DORA' }),
        expect.objectContaining({ framework: 'NIS2' }),
      ]),
    );
    expect(disclosures.certifiedConnectorsScope.p0Certified).toContain(
      'Microsoft Entra ID / M365',
    );
    expect(disclosures.aiSafetyGovernance.promptInjectionProtection).toBe(true);
  });
});
