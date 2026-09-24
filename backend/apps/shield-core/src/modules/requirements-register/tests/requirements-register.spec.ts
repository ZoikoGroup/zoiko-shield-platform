import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RequirementsRegisterService } from '../services/requirements-register.service';
import { TraceabilityGraphService } from '../services/traceability-graph.service';
import { RequirementsQualityGuard } from '../guards/requirements-quality.guard';
import { RequirementsReconciliationWorker } from '../workers/requirements-reconciliation.worker';
import { CreateRequirementDto } from '../dto/requirement.dto';

describe('Requirements & Traceability Register (R04) Suite', () => {
  let registerService: RequirementsRegisterService;
  let graphService: TraceabilityGraphService;
  let qualityGuard: RequirementsQualityGuard;
  let reconciliationWorker: RequirementsReconciliationWorker;

  const validReq: CreateRequirementDto = {
    id: 'REQ-CORE-TEST-01',
    version: '1.0.0',
    title: 'Test Core Requirement',
    statement:
      'The system must deterministically evaluate test assertions without side effects.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'Spec §07 Traceability Standard',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Deterministic output on repeated execution',
      'No state leaks across test boundaries',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'TestModule',
      sourceFilePath: 'backend/package.json',
      testFilePath: 'backend/package.json',
      evidenceGateId: 'G2-TEST-01',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequirementsQualityGuard,
        RequirementsRegisterService,
        TraceabilityGraphService,
        RequirementsReconciliationWorker,
      ],
    }).compile();

    qualityGuard = module.get<RequirementsQualityGuard>(
      RequirementsQualityGuard,
    );
    registerService = module.get<RequirementsRegisterService>(
      RequirementsRegisterService,
    );
    graphService = module.get<TraceabilityGraphService>(
      TraceabilityGraphService,
    );
    reconciliationWorker = module.get<RequirementsReconciliationWorker>(
      RequirementsReconciliationWorker,
    );
  });

  describe('1. §08 Quality Guard & Validation', () => {
    it('should validate and register a well-formed requirement', () => {
      expect(() => qualityGuard.validate(validReq)).not.toThrow();
      const node = registerService.registerRequirement(validReq);
      expect(node.id).toBe('REQ-CORE-TEST-01');
      expect(node.status).toBe('ACTIVE_COMMITTED');
    });

    it('should reject requirement with invalid ID format', () => {
      const invalid = { ...validReq, id: 'invalid-id' };
      expect(() => qualityGuard.validate(invalid)).toThrow(BadRequestException);
    });

    it('should reject requirement with empty acceptance criteria', () => {
      const invalid = {
        ...validReq,
        id: 'REQ-CORE-TEST-02',
        acceptanceCriteria: [],
      };
      expect(() => qualityGuard.validate(invalid)).toThrow(BadRequestException);
    });

    it('should reject requirement with missing authority reference', () => {
      const invalid = {
        ...validReq,
        id: 'REQ-CORE-TEST-03',
        authority: { type: 'ADR' as any, reference: '' },
      };
      expect(() => qualityGuard.validate(invalid)).toThrow(BadRequestException);
    });

    it('should reject duplicate requirement registrations', () => {
      registerService.registerRequirement(validReq);
      expect(() => registerService.registerRequirement(validReq)).toThrow(
        ConflictException,
      );
    });
  });

  describe('2. Querying & Lifecycle Transitions', () => {
    beforeEach(() => {
      registerService.registerRequirement(validReq);
      registerService.registerRequirement({
        ...validReq,
        id: 'REQ-AUTH-CEDAR-09',
        tenantScope: 'SOVEREIGN_CELL',
        authority: { type: 'LAW_REGULATION', reference: 'GDPR Art 32' },
        traceability: { implementingModule: 'AuthModule' },
      });
    });

    it('should retrieve requirement by ID', () => {
      const found = registerService.getRequirement('REQ-CORE-TEST-01');
      expect(found.title).toBe(validReq.title);
    });

    it('should throw NotFoundException for non-existent requirement', () => {
      expect(() =>
        registerService.getRequirement('REQ-NON-EXISTENT-99'),
      ).toThrow(NotFoundException);
    });

    it('should query requirements by tenantScope and authorityType', () => {
      const sovResults = registerService.queryRequirements({
        tenantScope: 'SOVEREIGN_CELL',
      });
      expect(sovResults).toHaveLength(1);
      expect(sovResults[0].id).toBe('REQ-AUTH-CEDAR-09');

      const lawResults = registerService.queryRequirements({
        authorityType: 'LAW_REGULATION',
      });
      expect(lawResults).toHaveLength(1);
      expect(lawResults[0].id).toBe('REQ-AUTH-CEDAR-09');
    });

    it('should update requirement lifecycle status', () => {
      const updated = registerService.updateRequirementStatus(
        'REQ-CORE-TEST-01',
        'VERIFIED_RELEASED',
      );
      expect(updated.status).toBe('VERIFIED_RELEASED');
    });
  });

  describe('3. §05 Precedence & Traceability Graph', () => {
    it('should calculate traceability coverage accurately', () => {
      registerService.registerRequirement(validReq);
      const coverage = graphService.getTraceabilityCoverage();
      expect(coverage.totalRequirements).toBe(1);
      expect(coverage.coveredByTests).toBe(1);
      expect(coverage.coveredByEvidenceGates).toBe(1);
      expect(coverage.testCoverageRatio).toBe(1);
      expect(coverage.untestedRequirements).toHaveLength(0);
    });

    it('should flag untested and ungated requirements in coverage report', () => {
      registerService.registerRequirement({
        ...validReq,
        id: 'REQ-CORE-UNTESTED-01',
        traceability: { implementingModule: 'RawModule' }, // No test, no gate
      });

      const coverage = graphService.getTraceabilityCoverage();
      expect(coverage.totalRequirements).toBe(1);
      expect(coverage.coveredByTests).toBe(0);
      expect(coverage.untestedRequirements).toContain('REQ-CORE-UNTESTED-01');
      expect(coverage.ungatedRequirements).toContain('REQ-CORE-UNTESTED-01');
    });

    it('should enforce §05 precedence hierarchy (Law > Standard > Spec > ADR)', () => {
      const lawReq = {
        ...validReq,
        id: 'REQ-LAW-01',
        authority: { type: 'LAW_REGULATION' as any, reference: 'GDPR' },
      };
      const adrReq = {
        ...validReq,
        id: 'REQ-ADR-01',
        authority: { type: 'ADR' as any, reference: 'ADR-001' },
      };

      const winner = graphService.resolvePrecedenceConflict(
        lawReq as any,
        adrReq as any,
      );
      expect(winner.id).toBe('REQ-LAW-01');
    });
  });

  describe('4. §05.1 Daily Reconciliation Engine', () => {
    it('should report clean status when all referenced files exist on disk', () => {
      registerService.registerRequirement(validReq);
      const report = reconciliationWorker.executeReconciliation();
      expect(report.status).toBe('CLEAN');
      expect(report.discrepanciesCount).toBe(0);
    });

    it('should detect missing source and test files', () => {
      registerService.registerRequirement({
        ...validReq,
        id: 'REQ-MISSING-FILES-01',
        traceability: {
          implementingModule: 'GhostModule',
          sourceFilePath: 'backend/non_existent_source.ts',
          testFilePath: 'backend/non_existent_test.spec.ts',
        },
      });

      const report = reconciliationWorker.executeReconciliation();
      expect(report.status).toBe('DISCREPANCIES_DETECTED');
      expect(report.discrepanciesCount).toBe(2);
      expect(
        report.discrepancies.some((d) => d.type === 'MISSING_SOURCE_FILE'),
      ).toBe(true);
      expect(
        report.discrepancies.some((d) => d.type === 'MISSING_TEST_FILE'),
      ).toBe(true);
    });

    it('should detect duplicate statements across different requirements', () => {
      registerService.registerRequirement(validReq);
      registerService.registerRequirement({
        ...validReq,
        id: 'REQ-DUPLICATE-STMT-02',
        statement: validReq.statement, // exact duplicate statement
      });

      const report = reconciliationWorker.executeReconciliation();
      expect(
        report.discrepancies.some((d) => d.type === 'DUPLICATE_STATEMENT'),
      ).toBe(true);
    });
  });
});
