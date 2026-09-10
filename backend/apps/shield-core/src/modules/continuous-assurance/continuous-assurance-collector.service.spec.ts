import { Test, TestingModule } from '@nestjs/testing';
import { ContinuousAssuranceCollectorService } from './continuous-assurance-collector.service';
import { ComplianceDriftMonitorService } from './compliance-drift-monitor.service';
import { EvidenceService } from '../evidence/services/evidence.service';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';

describe('ContinuousAssuranceCollector & DriftMonitor (Spec §8 & §55)', () => {
  let collectorService: ContinuousAssuranceCollectorService;
  let driftService: ComplianceDriftMonitorService;

  const mockEvidenceService = {
    createEvidence: jest.fn().mockImplementation((input) => ({
      id: `ev-mock-${Date.now()}`,
      content_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ...input,
    })),
  };

  const mockKafkaProducer = {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContinuousAssuranceCollectorService,
        ComplianceDriftMonitorService,
        { provide: EvidenceService, useValue: mockEvidenceService },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
      ],
    }).compile();

    collectorService = module.get<ContinuousAssuranceCollectorService>(ContinuousAssuranceCollectorService);
    driftService = module.get<ComplianceDriftMonitorService>(ComplianceDriftMonitorService);
    jest.clearAllMocks();
  });

  it('should evaluate controls and automatically record immutable EvidenceRecord objects', async () => {
    const result = await collectorService.runEvaluationCycle(
      'tenant-soc2-test',
      'PRODUCTION-EU-WEST',
      'eu-west-1',
      {
        mfaEnforcementRate: 100,
        standingAdminCount: 2,
        jitElevationActive: true,
        unreviewedElevationsCount: 0,
        merkleEpochValid: true,
        encryptionAtRestEnforced: true,
      },
    );

    expect(result.evaluatedControlsCount).toBe(3);
    expect(result.passedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.overallScore).toBe(100);
    expect(result.evidenceIds.length).toBe(3);
    expect(mockEvidenceService.createEvidence).toHaveBeenCalledTimes(3);
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalledTimes(1);
  });

  it('should detect compliance drift and emit SLA alarms when thresholds are breached', async () => {
    const driftResult = await driftService.evaluateComplianceDrift(
      'tenant-soc2-test',
      {
        ingestionLatencyMs: 45000, // Breaches 30,000ms threshold
        complianceScore: 78.5,     // Breaches 95.0% threshold (CRITICAL)
        activeConnectorCount: 3,
        unmanagedAdminCount: 8,    // Breaches ceiling of 5
      },
    );

    expect(driftResult.status).toBe('NON_COMPLIANT');
    expect(driftResult.activeAlarms.length).toBe(3);
    expect(driftResult.activeAlarms.map((a) => a.controlId)).toEqual(
      expect.arrayContaining(['SOC2-CC6.1-LATENCY', 'ISO27001-A.9.2-POSTURE', 'SOC2-CC6.1-IAM']),
    );
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalledTimes(1);
  });
});
