import { DoraComplianceService } from './dora-compliance.service';
import { Nis2ComplianceService } from './nis2-compliance.service';
import { PciDssComplianceService } from './pci-dss-compliance.service';

describe('Sector Packs Regulatory Compliance Services', () => {
  let doraService: DoraComplianceService;
  let nis2Service: Nis2ComplianceService;
  let pciService: PciDssComplianceService;

  beforeEach(() => {
    doraService = new DoraComplianceService();
    nis2Service = new Nis2ComplianceService();
    pciService = new PciDssComplianceService();
  });

  it('should evaluate DORA EU 2022/2554 compliance posture', async () => {
    const result = await doraService.evaluateTenant('tenant-fin-eu');
    expect(result.regulation).toBe('DORA_EU_2022_2554');
    expect(result.status).toBe('COMPLIANT');
    expect(result.overallScore).toBeGreaterThan(90);
    expect(result.pillars.ictRiskManagement.controlsPassing).toBe(24);
  });

  it('should evaluate NIS2 EU 2022/2555 directive compliance posture', async () => {
    const result = await nis2Service.evaluateTenant('tenant-infra-eu');
    expect(result.directive).toBe('NIS2_EU_2022_2555');
    expect(result.entityClassification).toBe('ESSENTIAL');
    expect(result.domains.incidentNotification24h.earlyWarningReady).toBe(true);
  });

  it('should evaluate PCI DSS v4.0.1 requirements', async () => {
    const result = await pciService.evaluateTenant('tenant-payments-corp');
    expect(result.standard).toBe('PCI_DSS_V4_0_1');
    expect(result.overallScore).toBe(98.0);
    expect(result.requirements.protectCardholderData.encryptionEnforced).toBe(
      true,
    );
  });
});
