import { Test, TestingModule } from '@nestjs/testing';
import { MdrServiceObligationService } from './mdr-service-obligation.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('MdrServiceObligationService', () => {
  let service: MdrServiceObligationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MdrServiceObligationService],
    }).compile();

    service = module.get<MdrServiceObligationService>(MdrServiceObligationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should permit 24/7 SOC claim when operational readiness is OPERATIONALLY_PROVEN', () => {
    // Default obligation has OPERATIONALLY_PROVEN status
    expect(() => service.assert24x7ClaimPermitted('contract-core-001')).not.toThrow();
  });

  it('should block 24/7 SOC claim (throw 409 Conflict) under Rule SVC-01 when readiness is UNPROVEN or CONTINGENT', () => {
    // Register contingent contract
    service.registerObligation({
      contractId: 'contract-unproven-002',
      tenantId: 'tenant-999',
      coverageTier: 'CONTINUOUS_24X7',
      staffingSchedule: {
        coverageTier: 'CONTINUOUS_24X7',
        primaryTimezone: 'UTC',
        minimumActiveAnalystsOnDuty: 1,
        escalationLeadAvailable: false,
        tier3IncidentCommanderOnCall: false,
        shiftHandoffProtocolProven: false, // Not proven
      },
    });

    expect(() => service.assert24x7ClaimPermitted('contract-unproven-002')).toThrow(
      ConflictException,
    );
  });

  it('should unlock 24/7 claim once operational shift audit proof is verified', () => {
    service.registerObligation({
      contractId: 'contract-to-verify-003',
      tenantId: 'tenant-888',
      coverageTier: 'CONTINUOUS_24X7',
      staffingSchedule: {
        coverageTier: 'CONTINUOUS_24X7',
        primaryTimezone: 'EST',
        minimumActiveAnalystsOnDuty: 2,
        escalationLeadAvailable: true,
        tier3IncidentCommanderOnCall: true,
        shiftHandoffProtocolProven: false,
      },
    });

    expect(() => service.assert24x7ClaimPermitted('contract-to-verify-003')).toThrow(
      ConflictException,
    );

    // Verify readiness
    service.verifyOperationalReadiness({
      contractId: 'contract-to-verify-003',
      auditorId: 'Lead-Auditor-42',
      proofDocumentRef: 'evidence://soc/q4-live-shift-proof-signed.pdf',
      passed24x7ShiftAudit: true,
    });

    expect(() => service.assert24x7ClaimPermitted('contract-to-verify-003')).not.toThrow();
    const verified = service.getObligation('contract-to-verify-003');
    expect(verified.readinessStatus).toBe('OPERATIONALLY_PROVEN');
    expect(verified.verifiedBy).toBe('Lead-Auditor-42');
  });

  it('should return complete SLA response windows including P1 (15m acknowledge / 60m contain)', () => {
    const defaultObligation = service.getObligation('contract-core-001');
    expect(defaultObligation.slaWindows.length).toBe(4);

    const p1 = defaultObligation.slaWindows.find((w) => w.severity === 'P1_CRITICAL');
    expect(p1).toBeDefined();
    expect(p1?.targetAcknowledgementMinutes).toBe(15);
    expect(p1?.targetContainmentMinutes).toBe(60);
  });
});
