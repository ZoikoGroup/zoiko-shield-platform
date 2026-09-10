import { Test, TestingModule } from '@nestjs/testing';
import {
  DualCustodyQuorumService,
  DualCustodyQuorumRequest,
  ApproverIdentity,
} from './dual-custody-quorum.service';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('DualCustodyQuorumService', () => {
  let service: DualCustodyQuorumService;

  const initiator: ApproverIdentity = {
    userId: 'usr-analyst-lead-01',
    fullName: 'Sarah Chen (Lead Analyst)',
    role: 'SECURITY_OPERATIONS_LEAD',
    fido2WebAuthnSignature: 'fido2-webauthn-sig-hardware-token-01',
    signedAt: new Date().toISOString(),
  };

  const secondaryApprover: ApproverIdentity = {
    userId: 'usr-soc-director-02',
    fullName: 'David Ross (SOC Director)',
    role: 'TENANT_OWNER',
    fido2WebAuthnSignature: 'fido2-webauthn-sig-hardware-token-02',
    signedAt: new Date().toISOString(),
  };

  const sampleRequest: DualCustodyQuorumRequest = {
    tenantId: 'tenant-enterprise-bank-01',
    environmentId: 'prod-us-east-1',
    caseId: 'case-2026-auth-01',
    proposalId: 'prop-isolate-db-01',
    actionType: 'ISOLATE_ENDPOINT',
    targetResource: 'srv-db-prod-01',
    authorityLevel: 'R2',
    blastRadiusScore: 0.15,
    reversibilityTier: 'R1',
    compensatingCommand: 'UNQUARANTINE_ENDPOINT',
    initiator,
    ttlMinutes: 15,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DualCustodyQuorumService],
    }).compile();

    service = module.get<DualCustodyQuorumService>(DualCustodyQuorumService);
  });

  it('should initiate a dual-custody approval quorum in PENDING_SECOND_SIGNATURE state', () => {
    const quorum = service.initiateQuorum(sampleRequest);

    expect(quorum).toBeDefined();
    expect(quorum.quorumId).toMatch(/^quorum-/);
    expect(quorum.status).toBe('PENDING_SECOND_SIGNATURE');
    expect(quorum.singleUseRollbackToken).toMatch(/^ZS-ROLLBACK-TOKEN-/);
    expect(quorum.compensatingPlan.rollbackCommand).toBe(
      'UNQUARANTINE_ENDPOINT',
    );
  });

  it('should reject initiation if initiator FIDO2 signature is omitted', () => {
    const invalidRequest = {
      ...sampleRequest,
      initiator: {
        ...initiator,
        fido2WebAuthnSignature: '',
      },
    };

    expect(() => service.initiateQuorum(invalidRequest)).toThrow(
      ForbiddenException,
    );
  });

  it('should strictly reject self-approval by the initiator (Two-Man rule non-negotiable invariant)', () => {
    const quorum = service.initiateQuorum(sampleRequest);

    // Initiator attempts to approve their own request as secondary approver
    expect(() =>
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        initiator,
      ),
    ).toThrow(ForbiddenException);
  });

  it('should successfully finalize quorum when a distinct authorized approver signs with FIDO2', () => {
    const quorum = service.initiateQuorum(sampleRequest);
    const finalized = service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );

    expect(finalized.status).toBe('QUORUM_REACHED');
    expect(finalized.secondaryApprover?.userId).toBe(secondaryApprover.userId);
    expect(finalized.quorumSignature).toBeDefined();
    expect(finalized.finalizedAt).toBeDefined();

    // Verify validation for execution
    const validation = service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );

    expect(validation.valid).toBe(true);
    expect(validation.receipt?.quorumSignature).toBe(finalized.quorumSignature);
  });

  it('should reject execution validation if quorum is still pending second signature', () => {
    const quorum = service.initiateQuorum(sampleRequest);

    const validation = service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('PENDING_SECOND_SIGNATURE');
  });

  it('should reject approval if the quorum ticket has expired', () => {
    const expiredRequest: DualCustodyQuorumRequest = {
      ...sampleRequest,
      ttlMinutes: -1, // Expired immediately
    };

    const quorum = service.initiateQuorum(expiredRequest);

    expect(() =>
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        secondaryApprover,
      ),
    ).toThrow(BadRequestException);
  });

  it('should throw NotFoundException for unknown quorum IDs', () => {
    expect(() =>
      service.signSecondApproval(
        sampleRequest.tenantId,
        'quorum-unknown-999',
        secondaryApprover,
      ),
    ).toThrow(NotFoundException);
  });
});
