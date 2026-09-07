import { Test, TestingModule } from '@nestjs/testing';
import {
  AuthorizationDecisionService,
  assertPermittedAuthorization,
} from '../authorization-decision/authorization-decision.service';
import { AuthorizationService } from './authorization.service';
import { CedarPolicyEvaluatorService } from './cedar-policy-evaluator.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

describe('LAB 12 — Negative Authorization & Cedar Policy Test Matrix', () => {
  let authDecisionService: AuthorizationDecisionService;
  let cedarEvaluator: CedarPolicyEvaluatorService;
  let mockPrisma: any;
  let mockAuthService: any;

  beforeEach(async () => {
    mockPrisma = {
      authorizationDecision: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            id: `auth-dec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...args.data,
          }),
        ),
      },
      partnerPrincipalContext: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      partnerDelegation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      entitlement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ent-1' }),
      },
      relationship: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rel-1' }),
      },
    };

    mockAuthService = {
      hasTenantAccess: jest.fn().mockImplementation((tenantId, actorId) => {
        if (actorId === 'user-revoked' || actorId === 'user-no-membership') {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      }),
      getPermissionCodesForPrincipal: jest
        .fn()
        .mockImplementation((tenantId, actorId) => {
          if (actorId === 'user-no-perm') {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            'tenant:resource:read',
            'tenant:resource:write',
            'case.read',
            'case.write',
          ]);
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationDecisionService,
        CedarPolicyEvaluatorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthorizationService, useValue: mockAuthService },
      ],
    }).compile();

    authDecisionService = module.get<AuthorizationDecisionService>(
      AuthorizationDecisionService,
    );
    cedarEvaluator = module.get<CedarPolicyEvaluatorService>(
      CedarPolicyEvaluatorService,
    );
  });

  describe('LAB 12 Mandatory Negative Test Cases', () => {
    // 1. Same user / wrong tenant
    it('Negative 1: should DENY when authenticated user attempts cross-tenant resource access', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-alpha',
        tenantId: 'tenant-alpha',
        authorizationScopeId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-999',
        resourceTenantId: 'tenant-beta', // Cross-tenant!
        purpose: 'investigation',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('DENY');
      expect(['CROSS_TENANT_RESOURCE', 'CEDAR_FORBID_TRIGGERED']).toContain(
        result.reasonCode,
      );
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });

    // 2. Same tenant / wrong legal entity
    it('Negative 2: should DENY when actor attempts access across mismatched legal entity boundaries', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-alpha',
        tenantId: 'tenant-alpha',
        legalEntityId: 'le-us-east',
        resourceLegalEntityId: 'le-eu-west', // Mismatched legal entity!
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-100',
        purpose: 'investigation',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('DENY');
      expect(result.reasonCode).toBe('CEDAR_FORBID_TRIGGERED');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });

    // 3. Stale / expired approval reference
    it('Negative 3: should DENY when operation carries an expired JIT or delegation approval', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-elevated',
        tenantId: 'tenant-alpha',
        action: 'case.write',
        resourceType: 'Case',
        resourceId: 'case-101',
        purpose: 'remediation',
        requiredPermissions: ['case.write'],
        approvalExpired: true, // Expired approval!
      });

      expect(result.decision).toBe('DENY');
      expect(result.reasonCode).toBe('CEDAR_FORBID_TRIGGERED');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });

    // 4. Missing / unauthorized purpose
    it('Negative 4: should return INDETERMINATE/DENY when mandatory purpose context is missing', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-alpha',
        tenantId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-102',
        purpose: '', // Missing purpose!
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reasonCode).toBe('MANDATORY_CONTEXT_MISSING');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ServiceUnavailableException,
      );
    });

    // 5. Revoked role / expired JIT elevation
    it('Negative 5: should DENY when actor membership or permissions are revoked', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-revoked',
        tenantId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-103',
        purpose: 'investigation',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('DENY');
      expect(result.reasonCode).toBe('ACTIVE_MEMBERSHIP_REQUIRED');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });

    // 6. Policy bundle unavailable (fail-closed)
    it('Negative 6: should fail closed (INDETERMINATE / 503) when Cedar policy bundle is unavailable', async () => {
      cedarEvaluator.setAvailable(false); // Simulate policy engine outage

      const result = await authDecisionService.evaluate({
        actorId: 'user-alpha',
        tenantId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-104',
        purpose: 'investigation',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reasonCode).toBe('POLICY_DEPENDENCY_UNAVAILABLE');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ServiceUnavailableException,
      );
    });

    // 7. Support user without customer approval
    it('Negative 7: should DENY when support operator attempts access without customer approval', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'support-agent-42',
        actorType: 'SUPPORT_OPERATOR',
        isSupportUser: true,
        hasCustomerApproval: false, // Lacks explicit customer JIT grant!
        tenantId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-105',
        purpose: 'support-diagnostic',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('DENY');
      expect(result.reasonCode).toBe('CEDAR_FORBID_TRIGGERED');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });

    // 8. AI agent attempting direct resource access
    it('Negative 8: should DENY when an AI agent attempts direct authoritative resource mutation', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'shield-ai-copilot',
        actorType: 'AI_AGENT',
        isSimulation: false, // Direct live execution attempt!
        tenantId: 'tenant-alpha',
        action: 'Action::"TERMINATE_INSTANCE"',
        resourceType: 'Resource::"CloudInstance"',
        resourceId: 'inst-1234',
        purpose: 'automated-remediation',
        requiredPermissions: ['tenant:resource:write'],
      });

      expect(result.decision).toBe('DENY');
      expect(result.reasonCode).toBe('CEDAR_FORBID_TRIGGERED');
      expect(() => assertPermittedAuthorization(result)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Positive Path Verification', () => {
    it('should PERMIT authorized SOC analyst in active investigation', async () => {
      const result = await authDecisionService.evaluate({
        actorId: 'user-soc-1',
        tenantId: 'tenant-alpha',
        authorizationScopeId: 'tenant-alpha',
        action: 'case.read',
        resourceType: 'Case',
        resourceId: 'case-100',
        resourceTenantId: 'tenant-alpha',
        purpose: 'investigation',
        requiredPermissions: ['case.read'],
      });

      expect(result.decision).toBe('PERMIT');
      expect(result.reasonCode).toBe('POLICY_PERMIT');
      expect(() => assertPermittedAuthorization(result)).not.toThrow();
    });
  });
});
