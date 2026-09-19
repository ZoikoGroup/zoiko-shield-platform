import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityStatusService } from './capability-status.service';

describe('CapabilityStatusService', () => {
  let service: CapabilityStatusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityStatusService],
    }).compile();

    service = module.get<CapabilityStatusService>(CapabilityStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return exactly 12 customer-visible public services', () => {
    const services = service.getPublicServices();
    expect(services.length).toBe(12);

    const serviceIds = services.map((s) => s.serviceId);
    expect(serviceIds).toContain('SVC-01');
    expect(serviceIds).toContain('SVC-02');
    expect(serviceIds).toContain('SVC-03');
    expect(serviceIds).toContain('SVC-05');
    expect(serviceIds).toContain('SVC-07');
    expect(serviceIds).toContain('SVC-08');
    expect(serviceIds).toContain('SVC-12');
  });

  it('should substantiate public services with internal satellites without publishing them as services', () => {
    const services = service.getPublicServices();
    for (const s of services) {
      expect(s.substantiatingComponents.length).toBeGreaterThan(0);
      expect(s.publicOutcomeDescription).toBeDefined();
      expect(s.publicOutcomeDescription.length).toBeGreaterThan(10);
    }
  });

  it('should return capability items grouped across 7 domains', () => {
    const domains = service.getCapabilitiesByDomain();
    expect(domains.length).toBeGreaterThanOrEqual(7);

    const domainIds = domains.map((d) => d.domainId);
    expect(domainIds).toContain('INGESTION_CONNECTIVITY');
    expect(domainIds).toContain('ASSURANCE_EVIDENCE');
    expect(domainIds).toContain('MANAGED_DEFENSE');
    expect(domainIds).toContain('SOAR_RESPONSE');
    expect(domainIds).toContain('INCIDENT_RETAINER');
    expect(domainIds).toContain('AI_GOVERNANCE');
    expect(domainIds).toContain('SECTOR_PACKS');
  });

  it('should correctly evaluate active vs deferred vs gated capabilities', () => {
    // CORE capability must be available
    expect(service.isCapabilityAvailable('CAP-ASSURE-01')).toBe(true);
    expect(service.isCapabilityAvailable('CAP-DETECT-01')).toBe(true);

    // CONTROLLED capability is available (subject to execution guard)
    expect(service.isCapabilityAvailable('CAP-ACTION-02')).toBe(true);
    expect(service.isCapabilityAvailable('CAP-IR-02')).toBe(true);

    // DEFERRED capability must NOT be available
    expect(service.isCapabilityAvailable('CAP-FRAME-01')).toBe(false); // DORA
    expect(service.isCapabilityAvailable('CAP-FRAME-02')).toBe(false); // NIS2

    // GATED capability must NOT be available
    expect(service.isCapabilityAvailable('CAP-SECTOR-01')).toBe(false);
    expect(service.isCapabilityAvailable('CAP-CRYPTO-02')).toBe(false);
  });

  it('should enforce framework evaluator activation baseline (SOC 2 & ISO 27001 active; DORA & NIS2 deferred)', () => {
    expect(service.isFrameworkEvaluatorActive('SOC2_CC6_1')).toBe(true);
    expect(service.isFrameworkEvaluatorActive('ISO27001_A9_2')).toBe(true);
    expect(service.isFrameworkEvaluatorActive('DORA')).toBe(false);
    expect(service.isFrameworkEvaluatorActive('NIS2')).toBe(false);
    expect(service.isFrameworkEvaluatorActive('PCI_DSS_V4')).toBe(false);
  });

  it('should enforce connector gating rules', () => {
    expect(service.isConnectorAvailable('entra-id')).toBe(true);
    expect(service.isConnectorAvailable('aws-cloudtrail')).toBe(true);
    expect(service.isConnectorAvailable('sap-enterprise-gated')).toBe(false);
  });
});
