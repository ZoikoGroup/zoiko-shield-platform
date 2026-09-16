import { BadRequestException } from '@nestjs/common';
import { requireTenantId } from '../../src/tenant-context';
import { createWorkloadToken, verifyWorkloadToken } from '../../../../libs/security/src/workload-token';
import { BatchMerkleCheckpointerService } from '../../../shield-anchor/src/merkle/batch-merkle-checkpointer.service';
import { CedarPolicyEvaluatorService } from '../../src/modules/authorization/cedar-policy-evaluator.service';

describe('Checkpoint 9 - Cross-Tenant Negative Isolation Integration Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const INVALID_DEFAULT_TENANT = 'default-tenant';

  beforeAll(() => {
    process.env.SERVICE_NAME = 'shield-core';
    process.env.WORKLOAD_IDENTITY_DEV_SECRET = 'local-workload-identity-change-me';
  });

  describe('1. Tenant Context & Header Poisoning Resistance (§06)', () => {
    it('should reject missing tenant header when user context has no tenant', () => {
      expect(() => requireTenantId(undefined, undefined)).toThrow(BadRequestException);
    });

    it('should reject invalid default-tenant identifier', () => {
      expect(() => requireTenantId(INVALID_DEFAULT_TENANT, undefined)).toThrow(BadRequestException);
    });

    it('should reject mismatching header and JWT tenant claims (spoofing attempt)', () => {
      expect(() => requireTenantId(TENANT_A, TENANT_B)).toThrow(BadRequestException);
    });

    it('should accept matching header and JWT tenant claims', () => {
      const resolved = requireTenantId(TENANT_A, TENANT_A);
      expect(resolved).toBe(TENANT_A);
    });

    it('should safely fall back to JWT user tenant when header is omitted', () => {
      const resolved = requireTenantId(undefined, TENANT_A);
      expect(resolved).toBe(TENANT_A);
    });
  });

  describe('2. Workload Token Boundary & Cross-Service Audience (§06)', () => {
    it('should reject workload tokens with incorrect audience claim', () => {
      const tokenForAi = createWorkloadToken('shield-ai');
      expect(() => verifyWorkloadToken(tokenForAi, 'shield-ingest')).toThrow();
    });

    it('should reject workload tokens with tampered signature', () => {
      const validToken = createWorkloadToken('shield-core');
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';
      expect(() => verifyWorkloadToken(tamperedToken, 'shield-core')).toThrow();
    });

    it('should successfully verify valid audience tokens', () => {
      const validToken = createWorkloadToken('shield-anchor');
      const verified = verifyWorkloadToken(validToken, 'shield-anchor');
      expect(verified.aud).toBe('shield-anchor');
      expect(verified.iss).toBe('zoikoshield-workload-identity');
    });
  });

  describe('3. Cryptographic Merkle Ledger Tenant Isolation (§08)', () => {
    let checkpointer: BatchMerkleCheckpointerService;

    beforeEach(() => {
      checkpointer = new BatchMerkleCheckpointerService();
    });

    it('should isolate evidence leaves and enforce tenant domain binding', () => {
      const items = [
        {
          evidenceId: 'ev-tenant-a-1',
          tenantId: TENANT_A,
          eventType: 'AUTH_SUCCESS',
          payloadDigest: 'sha256_tenant_a_digest_001',
          timestamp: new Date().toISOString(),
        },
        {
          evidenceId: 'ev-tenant-b-1',
          tenantId: TENANT_B,
          eventType: 'SECURITY_ALERT',
          payloadDigest: 'sha256_tenant_b_digest_001',
          timestamp: new Date().toISOString(),
        },
      ];

      const checkpoint = checkpointer.buildEpochCheckpoint(items);
      expect(checkpoint.leafCount).toBe(2);
      expect(checkpoint.merkleRoot).toBeDefined();

      const proofA = checkpointer.generateInclusionProof(checkpoint.epochNumber, 0);
      expect(proofA.leafIndex).toBe(0);
      expect(checkpointer.verifyInclusionProof(proofA)).toBe(true);

      // Attempting to verify Tenant A's leaf under an altered root or swapped leaf index fails
      const tamperedProof = {
        ...proofA,
        leafHash: proofA.leafHash.replace('a', 'b'),
      };
      expect(checkpointer.verifyInclusionProof(tamperedProof)).toBe(false);
    });
  });

  describe('4. Cedar Multi-Tenant Policy Authorization Matrix (§03)', () => {
    let cedar: CedarPolicyEvaluatorService;

    beforeEach(() => {
      cedar = new CedarPolicyEvaluatorService();
    });

    it('should deny cross-tenant resource access by default', () => {
      const decision = cedar.evaluate({
        principal: 'Principal::"usr-analyst-tenant-a"',
        action: 'Action::"case.close"',
        resource: 'Resource::"case-999"',
        context: {
          tenantId: TENANT_A,
          resourceTenantId: TENANT_B,
          isCrossTenant: true,
        },
      });

      expect(decision.decision).toBe('DENY');
    });

    it('should allow valid same-tenant security operations', () => {
      const decision = cedar.evaluate({
        principal: 'Group::"soc-analysts"',
        action: 'Action::"case.read"',
        resource: 'Resource::"Case"',
        context: {
          tenantId: TENANT_A,
          resourceTenantId: TENANT_A,
          isTenantAuthorized: true,
          purpose: 'investigation',
        },
      });

      expect(decision.decision).toBe('ALLOW');
    });
  });
});
