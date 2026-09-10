import { Test, TestingModule } from '@nestjs/testing';
import {
  DecisionRightsService,
  CreateEnvelopeInput,
} from './decision-rights.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

describe('DecisionRightsService (§16 Human Oversight & Decision-Rights Engine)', () => {
  let service: DecisionRightsService;
  let mockKafkaProducer: Partial<KafkaProducerService>;

  const validEnvelopeInput: CreateEnvelopeInput<{
    recommendation: string;
    targetResource: string;
  }> = {
    tenantId: 'tenant-test-01',
    environmentId: 'env-prod-01',
    aiLabelAndUseCaseName: {
      aiLabel: 'ZoikoShield Copilot v2',
      useCaseName: 'RESPONSE_RECOMMENDATION',
      modelRoute: 'gemini-1.5-pro',
      version: '1.0.0',
    },
    sourcesAndSpans: [
      {
        sourceId: 'evt-aws-cloudtrail-991',
        sourceType: 'AWS_CLOUDTRAIL',
        version: 1,
        exactSpan: 'AttachUserPolicy AdministratorAccess to compromised-role',
        confidence: 0.98,
      },
    ],
    knownMissingStaleOrConflictingEvidence: {
      missingEvidence: ['okta-mfa-logs-last-10m'],
      staleEvidence: [],
      conflictingEvidence: [],
    },
    calibratedConfidenceAndUncertainty: {
      score: 0.92,
      qualitativeBand: 'HIGH',
      calibrationBasis: 'Historical incident similarity and rule corroboration',
      uncertaintyFactors: ['Partial Okta log delay'],
    },
    alternativeHypothesesOrActions: [
      {
        title: 'Network Quarantine Only',
        rationale:
          'Isolate host without revoking IAM credentials to preserve telemetry',
        tradeOffs:
          'Higher risk of credential reuse against other cloud resources',
      },
    ],
    expectedImpactAndReversibility: {
      blastRadius: 'Single IAM role and single EC2 bastion host',
      isReversible: true,
      reversibilityTier: 'R2',
      compensationPlan:
        'Re-enable IAM policy attachment via 1-click compensation receipt',
    },
    requiredAuthorityAndApprovals: {
      requiredRole: 'SECURITY_OPERATIONS_LEAD',
      responseAuthorityTier: 'R2',
      dualApproverRequired: false,
    },
    appealOrFeedbackRoute: {
      appealUrl: '/api/v1/ai/decisions/appeal',
      feedbackChannel: 'secops-appeals',
      customerAffecting: true,
    },
    payload: {
      recommendation:
        'Revoke IAM policy AdministratorAccess and isolate bastion-srv-01',
      targetResource: 'arn:aws:iam::123456789012:role/compromised-role',
    },
  };

  beforeEach(async () => {
    mockKafkaProducer = {
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionRightsService,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
      ],
    }).compile();

    service = module.get<DecisionRightsService>(DecisionRightsService);
  });

  describe('1. Invariant Validation & Envelope Construction (Spec §16.1)', () => {
    it('should create a complete 10-field AiReviewEnvelope when input is valid', () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      expect(envelope).toBeDefined();
      expect(envelope.envelopeId).toMatch(/^env-/);
      expect(envelope.controls.state).toBe('UNREVIEWED');
      expect(envelope.controls.availableTransitions).toEqual([
        'ACCEPT',
        'MODIFY',
        'REJECT',
        'ESCALATE',
      ]);
      expect(envelope.aiLabelAndUseCaseName.useCaseName).toBe(
        'RESPONSE_RECOMMENDATION',
      );
      expect(envelope.sourcesAndSpans.length).toBe(1);
      expect(envelope.calibratedConfidenceAndUncertainty.score).toBe(0.92);
      expect(envelope.expectedImpactAndReversibility.reversibilityTier).toBe(
        'R2',
      );
      expect(envelope.requiredAuthorityAndApprovals.requiredRole).toBe(
        'SECURITY_OPERATIONS_LEAD',
      );
      expect(envelope.appealOrFeedbackRoute.customerAffecting).toBe(true);
    });

    it('should reject envelope creation if AI label or use-case name is missing', () => {
      const invalid = {
        ...validEnvelopeInput,
        aiLabelAndUseCaseName: undefined as any,
      };
      expect(() => service.wrapInEnvelope(invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject envelope creation if sources/spans are missing or empty', () => {
      const invalid = { ...validEnvelopeInput, sourcesAndSpans: [] };
      expect(() => service.wrapInEnvelope(invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject envelope creation if calibrated confidence score is out of bounds', () => {
      const invalid = {
        ...validEnvelopeInput,
        calibratedConfidenceAndUncertainty: {
          score: 1.5, // Invalid > 1.0
          qualitativeBand: 'HIGH' as const,
          calibrationBasis: 'test',
          uncertaintyFactors: [],
        },
      };
      expect(() => service.wrapInEnvelope(invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject envelope creation if expected impact / reversibility is missing', () => {
      const invalid = {
        ...validEnvelopeInput,
        expectedImpactAndReversibility: undefined as any,
      };
      expect(() => service.wrapInEnvelope(invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject envelope creation if required authority is missing', () => {
      const invalid = {
        ...validEnvelopeInput,
        requiredAuthorityAndApprovals: undefined as any,
      };
      expect(() => service.wrapInEnvelope(invalid)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. State Machine & Human Decision Recording (Spec §16.1 Items 8 & 9)', () => {
    it('should record ACCEPT decision with mandatory rationale and transition state to ACCEPTED', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      const updated = await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'ACCEPT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale:
            'Confirmed malicious API activity in CloudTrail; blast radius verified safe.',
        },
      );

      expect(updated.controls.state).toBe('ACCEPTED');
      expect(updated.controls.availableTransitions).toEqual([]);
      expect(updated.humanDecisionAndRationale.decision).toBe('ACCEPT');
      expect(updated.humanDecisionAndRationale.decidedBy).toBe(
        'lead-analyst@zoiko.com',
      );
      expect(updated.humanDecisionAndRationale.rationale).toBe(
        'Confirmed malicious API activity in CloudTrail; blast radius verified safe.',
      );
      expect(updated.humanDecisionAndRationale.evidenceRef).toMatch(/^ev-dec-/);
    });

    it('should reject human decision if rationale is missing or empty', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await expect(
        service.recordHumanDecision(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            decision: 'ACCEPT',
            decidedBy: 'lead-analyst@zoiko.com',
            rationale: '', // Non-negotiable requirement
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record MODIFY decision with modifiedContent and transition state to MODIFIED', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      const updated = await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'MODIFY',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale:
            'Modifying containment to exclude staging bastion from isolation.',
          modifiedContent:
            'Revoke IAM policy AdministratorAccess only (leave host online for forensic dump)',
        },
      );

      expect(updated.controls.state).toBe('MODIFIED');
      expect(updated.humanDecisionAndRationale.modifiedContent).toBe(
        'Revoke IAM policy AdministratorAccess only (leave host online for forensic dump)',
      );
    });

    it('should reject MODIFY decision if modifiedContent is not provided', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await expect(
        service.recordHumanDecision(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            decision: 'MODIFY',
            decidedBy: 'lead-analyst@zoiko.com',
            rationale: 'Modifying plan',
            modifiedContent: '', // Missing
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record REJECT decision and transition state to REJECTED', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      const updated = await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'REJECT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale:
            'False positive: Authorized DevOps disaster recovery test in progress.',
        },
      );

      expect(updated.controls.state).toBe('REJECTED');
      expect(updated.humanDecisionAndRationale.decision).toBe('REJECT');
    });

    it('should record ESCALATE decision and update required role', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      const updated = await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'ESCALATE',
          decidedBy: 'junior-analyst@zoiko.com',
          rationale:
            'Potential executive account compromise; requires CISO authorization.',
          escalatedToRole: 'CHIEF_INFORMATION_SECURITY_OFFICER',
        },
      );

      expect(updated.controls.state).toBe('ESCALATED');
      expect(updated.requiredAuthorityAndApprovals.requiredRole).toBe(
        'CHIEF_INFORMATION_SECURITY_OFFICER',
      );
    });

    it('should disallow further transitions on an already REJECTED envelope', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'REJECT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale: 'Rejected as false positive',
        },
      );

      await expect(
        service.recordHumanDecision(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            decision: 'ACCEPT',
            decidedBy: 'lead-analyst@zoiko.com',
            rationale: 'Re-evaluating',
          },
        ),
      ).rejects.toThrow(PreconditionFailedException);
    });
  });

  describe('3. Downstream Action Gatekeeping (Blocking unverified actions)', () => {
    it('should BLOCK downstream execution when envelope is UNREVIEWED', () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      expect(() =>
        service.assertActionPermitted(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            role: 'SECURITY_OPERATIONS_LEAD',
            responseAuthorityTier: 'R2',
          },
        ),
      ).toThrow(PreconditionFailedException);
    });

    it('should BLOCK downstream execution when envelope is REJECTED', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'REJECT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale: 'Rejected',
        },
      );

      expect(() =>
        service.assertActionPermitted(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            role: 'SECURITY_OPERATIONS_LEAD',
            responseAuthorityTier: 'R2',
          },
        ),
      ).toThrow(ForbiddenException);
    });

    it('should BLOCK downstream execution if actor response authority tier is insufficient', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'ACCEPT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale: 'Approved',
        },
      );

      // Required is R2; requesting actor is R1
      expect(() =>
        service.assertActionPermitted(
          validEnvelopeInput.tenantId,
          envelope.envelopeId,
          {
            role: 'JUNIOR_ANALYST',
            responseAuthorityTier: 'R1',
          },
        ),
      ).toThrow(ForbiddenException);
    });

    it('should PERMIT downstream execution when envelope is ACCEPTED and actor authority satisfies requirements', async () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      await service.recordHumanDecision(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          decision: 'ACCEPT',
          decidedBy: 'lead-analyst@zoiko.com',
          rationale: 'Approved for containment',
        },
      );

      const permitted = service.assertActionPermitted(
        validEnvelopeInput.tenantId,
        envelope.envelopeId,
        {
          role: 'SECURITY_OPERATIONS_LEAD',
          responseAuthorityTier: 'R2',
        },
      );

      expect(permitted).toBeDefined();
      expect(permitted.controls.state).toBe('ACCEPTED');
    });
  });

  describe('4. Tenant Isolation & Querying', () => {
    it('should reject access from a different tenant with ForbiddenException', () => {
      const envelope = service.wrapInEnvelope(validEnvelopeInput);

      expect(() =>
        service.getEnvelope('tenant-different-corp', envelope.envelopeId),
      ).toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent envelope ID', () => {
      expect(() =>
        service.getEnvelope(
          validEnvelopeInput.tenantId,
          'env-non-existent-999',
        ),
      ).toThrow(NotFoundException);
    });

    it('should list envelopes filtered by tenant and state', async () => {
      const env1 = service.wrapInEnvelope({
        ...validEnvelopeInput,
        tenantId: 'tenant-list-test',
      });
      const env2 = service.wrapInEnvelope({
        ...validEnvelopeInput,
        tenantId: 'tenant-list-test',
      });

      await service.recordHumanDecision('tenant-list-test', env1.envelopeId, {
        decision: 'ACCEPT',
        decidedBy: 'lead@zoiko.com',
        rationale: 'Accepted',
      });

      const unreviewed = service.listEnvelopes('tenant-list-test', {
        state: 'UNREVIEWED',
      });
      const accepted = service.listEnvelopes('tenant-list-test', {
        state: 'ACCEPTED',
      });

      expect(unreviewed.length).toBe(1);
      expect(unreviewed[0].envelopeId).toBe(env2.envelopeId);
      expect(accepted.length).toBe(1);
      expect(accepted[0].envelopeId).toBe(env1.envelopeId);
    });
  });
});
