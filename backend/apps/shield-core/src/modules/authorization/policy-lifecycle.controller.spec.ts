import { Test, TestingModule } from '@nestjs/testing';
import { PolicyLifecycleController } from './policy-lifecycle.controller';
import { PolicyLifecycleService } from './policy-lifecycle.service';
import { AuthorizationService } from './authorization.service';
import { AuthorizationDecisionService } from '../authorization-decision/authorization-decision.service';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

describe('PolicyLifecycleController', () => {
  let controller: PolicyLifecycleController;
  let service: PolicyLifecycleService;

  const mockUser: AuthenticatedUser = {
    id: 'usr-secops-01',
    sessionId: 'sess-secops-01',
    email: 'secops@zoikoshield.corp',
    fullName: 'SecOps Administrator',
    emailVerified: true,
    assurance: 'PASSKEY',
    tenantId: 'tenant-acme',
    membershipId: 'mem-secops-01',
    environmentId: 'env-prod',
    region: 'europe-west3',
    policyVersion: '1.0.0',
    riskState: 'LOW',
    sessionState: 'ACTIVE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PolicyLifecycleController],
      providers: [
        {
          provide: PolicyLifecycleService,
          useValue: {
            listPolicies: jest.fn().mockReturnValue([
              {
                id: 'pol-2026-09-001',
                policyName: 'Zero-Trust JIT Admin Escalation Policy',
                domain: 'IAM',
                status: 'PENDING_APPROVAL',
              },
            ]),
            getPolicyById: jest.fn().mockReturnValue({
              id: 'pol-2026-09-001',
              policyName: 'Zero-Trust JIT Admin Escalation Policy',
            }),
            stagePolicy: jest.fn().mockReturnValue({
              id: 'pol-2026-09-001',
              status: 'STAGED',
              canaryPercentage: 25,
            }),
            approvePolicy: jest.fn().mockReturnValue({
              id: 'pol-2026-09-001',
              status: 'ACTIVE',
              approvers: [
                'soc-lead@zoikoshield.corp',
                'secops@zoikoshield.corp',
              ],
            }),
            rollbackPolicy: jest.fn().mockReturnValue({
              id: 'pol-2026-09-001',
              status: 'ROLLED_BACK',
              canaryPercentage: 0,
            }),
            simulatePolicy: jest.fn().mockReturnValue({
              policyId: 'pol-2026-09-001',
              syntaxValid: true,
              changedKeys: ['jit_elevation'],
              unchangedKeys: [],
            }),
            listAuditEvents: jest.fn().mockReturnValue([
              {
                id: 'evt-1',
                action: 'STAGED',
                actorId: 'secops@zoikoshield.corp',
              },
            ]),
          },
        },
        {
          provide: AuthorizationService,
          useValue: {
            getPermissionCodesForPrincipal: jest.fn(),
          },
        },
        {
          provide: AuthorizationDecisionService,
          useValue: {
            evaluate: jest.fn().mockResolvedValue({ decision: 'PERMIT' }),
          },
        },
      ],
    }).compile();

    controller = module.get<PolicyLifecycleController>(
      PolicyLifecycleController,
    );
    service = module.get<PolicyLifecycleService>(PolicyLifecycleService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listPolicies', () => {
    it('delegates to service with tenant and domain filter', () => {
      const result = controller.listPolicies(mockUser, 'tenant-acme', 'IAM');
      expect(service.listPolicies).toHaveBeenCalledWith('tenant-acme', 'IAM');
      expect(result).toHaveLength(1);
    });
  });

  describe('getPolicyById', () => {
    it('delegates to service getPolicyById', () => {
      const result = controller.getPolicyById(
        mockUser,
        'pol-2026-09-001',
        'tenant-acme',
      );
      expect(service.getPolicyById).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
      );
      expect(result.id).toBe('pol-2026-09-001');
    });
  });

  describe('simulatePolicy', () => {
    it('delegates to service simulatePolicy with caller identity', () => {
      const result = controller.simulatePolicy(
        mockUser,
        'pol-2026-09-001',
        'tenant-acme',
      );
      expect(service.simulatePolicy).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
        'secops@zoikoshield.corp',
      );
      expect(result.syntaxValid).toBe(true);
    });
  });

  describe('listAuditEvents', () => {
    it('delegates to service listAuditEvents', () => {
      const result = controller.listAuditEvents(
        mockUser,
        'pol-2026-09-001',
        'tenant-acme',
      );
      expect(service.listAuditEvents).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('stagePolicy', () => {
    it('delegates to service stagePolicy with caller identity', () => {
      const dto = {
        stagedEnvironment: 'staging-us-east1',
        canaryPercentage: 25,
      };
      const result = controller.stagePolicy(
        mockUser,
        'pol-2026-09-001',
        dto,
        'tenant-acme',
      );
      expect(service.stagePolicy).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
        dto,
        'secops@zoikoshield.corp',
      );
      expect(result.status).toBe('STAGED');
    });
  });

  describe('approvePolicy', () => {
    it('delegates to service approvePolicy with caller identity', () => {
      const dto = {
        notes: 'Verified against zero-trust standards.',
      };
      const result = controller.approvePolicy(
        mockUser,
        'pol-2026-09-001',
        dto,
        'tenant-acme',
      );
      expect(service.approvePolicy).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
        'secops@zoikoshield.corp',
      );
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('rollbackPolicy', () => {
    it('delegates to service rollbackPolicy with reason', () => {
      const dto = {
        reason: 'Anomaly detected in canary deployment.',
      };
      const result = controller.rollbackPolicy(
        mockUser,
        'pol-2026-09-001',
        dto,
        'tenant-acme',
      );
      expect(service.rollbackPolicy).toHaveBeenCalledWith(
        'tenant-acme',
        'pol-2026-09-001',
        dto,
        'secops@zoikoshield.corp',
      );
      expect(result.status).toBe('ROLLED_BACK');
    });
  });
});
