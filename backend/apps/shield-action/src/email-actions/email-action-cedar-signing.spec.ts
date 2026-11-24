import {
  EmailActionAdapterService,
  type EmailActionProposalInput,
} from './email-action-adapter.service';
import type { EmailProviderMutationPort } from './email-provider-mutation.port';
import { ActionAuthorityService } from '../policy/action-authority.service';
import { CedarPolicyEvaluatorService } from '../policy/cedar-policy-evaluator.service';
import { CedarTenantIsolationService } from '../policy/cedar-tenant-isolation.service';
import { PerTenantCommandSignerService } from '../command-signing/per-tenant-command-signer.service';
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';

describe('EmailActionAdapterService — Cedar Authorization & Per-Tenant Signing', () => {
  const FUTURE = () => new Date(Date.now() + 10 * 60_000).toISOString();
  let port: EmailProviderMutationPort;
  let cedarPolicy: CedarPolicyEvaluatorService;
  let cedarIsolation: CedarTenantIsolationService;
  let tenantSigner: PerTenantCommandSignerService;
  let service: EmailActionAdapterService;

  const baseInput = (
    over: Partial<EmailActionProposalInput> = {},
  ): EmailActionProposalInput => ({
    proposalId: 'prop-cedar-1',
    tenantId: 'tenant-alpha',
    provider: 'MICROSOFT_365',
    requestedAction: 'QUARANTINE_MESSAGE',
    targetRefs: ['alice@alpha.test::msg-1'],
    consentScope: 'Mail.ReadWrite',
    riskClass: 'R3',
    initiatedBy: 'analyst-1',
    approvedBy: 'director-1',
    approvalExpiresAt: FUTURE(),
    hasDedicatedWriteCredential: true,
    actorTenantId: 'tenant-alpha',
    actorType: 'HUMAN_USER',
    actorRoles: ['SOC_ADMIN'],
    purpose: 'email_threat_remediation',
    ...over,
  });

  beforeEach(() => {
    process.env.ENABLE_EMAIL_PHASE2_ACTIONS = 'true';
    port = {
      mutate: jest.fn(async (req) => ({
        targetRef: req.targetRef,
        status: 'VERIFIED' as const,
        providerReceiptId: `m365:${req.targetRef}`,
      })),
    };
    cedarPolicy = new CedarPolicyEvaluatorService();
    cedarIsolation = new CedarTenantIsolationService();
    tenantSigner = new PerTenantCommandSignerService();
    service = new EmailActionAdapterService(
      { isFrozen: jest.fn(async () => ({ frozen: false })) } as any,
      new ActionAuthorityService(),
      new BlastRadiusEvaluatorService(),
      port,
      cedarPolicy,
      cedarIsolation,
      tenantSigner,
    );
  });

  afterEach(() => {
    delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
  });

  describe('Cedar authorization checks on simulate, execute, and rollback', () => {
    it('denies cross-tenant execution before calling provider', async () => {
      await expect(
        service.execute(
          baseInput({
            tenantId: 'tenant-alpha',
            actorTenantId: 'tenant-beta',
          }),
        ),
      ).rejects.toThrow(/DENIED_CROSS_TENANT_ACCESS/);
      expect(port.mutate).not.toHaveBeenCalled();
    });

    it('denies cross-tenant simulation and rollback', async () => {
      await expect(
        service.simulate(
          baseInput({
            tenantId: 'tenant-alpha',
            actorTenantId: 'tenant-beta',
          }),
        ),
      ).rejects.toThrow(/DENIED_CROSS_TENANT_ACCESS/);

      await expect(
        service.rollback({
          proposalId: 'prop-1',
          tenantId: 'tenant-alpha',
          actorTenantId: 'tenant-beta',
          requestedBy: 'analyst-1',
          targetRefs: ['alice@alpha.test::msg-1'],
        }),
      ).rejects.toThrow(/DENIED_CROSS_TENANT_ACCESS/);
    });

    it('denies AI_AGENT principals on live execute and rollback', async () => {
      await expect(
        service.execute(baseInput({ actorType: 'AI_AGENT' })),
      ).rejects.toThrow(/DENIED_AI_AGENT_DIRECT_RESOURCE_ACCESS/);
      expect(port.mutate).not.toHaveBeenCalled();

      await expect(
        service.rollback({
          proposalId: 'prop-1',
          tenantId: 'tenant-alpha',
          requestedBy: 'copilot-agent',
          actorType: 'AI_AGENT',
          targetRefs: ['alice@alpha.test::msg-1'],
        }),
      ).rejects.toThrow(/DENIED_AI_AGENT_DIRECT_RESOURCE_ACCESS/);
    });

    it('denies mismatched legal entity and missing purpose', async () => {
      await expect(
        service.execute(
          baseInput({
            legalEntityId: 'le-us',
            resourceLegalEntityId: 'le-eu',
          }),
        ),
      ).rejects.toThrow(/DENIED_WRONG_LEGAL_ENTITY/);

      await expect(service.execute(baseInput({ purpose: '' }))).rejects.toThrow(
        /DENIED_MISSING_PURPOSE/,
      );
      expect(port.mutate).not.toHaveBeenCalled();
    });

    it('denies insufficient role (e.g. AUDITOR attempting R3 execute)', async () => {
      await expect(
        service.execute(baseInput({ actorRoles: ['SECURITY_AUDITOR'] })),
      ).rejects.toThrow(/DENIED_REVOKED_OR_INSUFFICIENT_ROLE/);
      expect(port.mutate).not.toHaveBeenCalled();
    });

    it('enforces explicit Cedar forbid policy overrides over permits', async () => {
      cedarPolicy.registerPolicy({
        policyId: 'cedar-forbid-tenant-alpha-quarantine',
        effect: 'forbid',
        principal: '*',
        action: 'Action::"QUARANTINE_MESSAGE"',
        resource: '*',
        conditions: { when: { 'context.tenantId': 'tenant-alpha' } },
        description: 'Emergency tenant policy forbid',
      });

      await expect(service.execute(baseInput())).rejects.toThrow(
        /CEDAR_POLICY_DENIED.*cedar-forbid-tenant-alpha-quarantine/,
      );
      expect(port.mutate).not.toHaveBeenCalled();
    });
  });

  describe('Per-tenant cryptographic command signing', () => {
    it('attaches Cedar attestation and per-tenant signed command envelopes to execute()', async () => {
      const res = await service.execute(
        baseInput({
          targetRefs: ['alice@alpha.test::msg-1', 'bob@alpha.test::msg-2'],
        }),
      );

      expect(res.status).toBe('VERIFIED');
      expect(res.cedarAuthorization.reasonCode).toBe('PERMITTED_BY_POLICY');
      expect(res.cedarAuthorization.matchedPolicies).toContain(
        'cedar-pol-email-001',
      );
      expect(res.commandSignatures).toHaveLength(2);
      expect(res.commandSignatures[0].tenantId).toBe('tenant-alpha');
      expect(res.commandSignatures[0].signingKeyId).toContain('tenant-alpha');
      expect(res.commandSignatures[0].signature).toMatch(/^[0-9a-f]+$/i);
      expect(res.commandSignatures[0].nonce).not.toBe(
        res.commandSignatures[1].nonce,
      );
    });

    it('isolates signing keys per tenant so Tenant A signatures fail for Tenant B', async () => {
      const envA = await tenantSigner.signCommand({
        tenantId: 'tenant-alpha',
        proposalId: 'p1',
        actionType: 'QUARANTINE_MESSAGE',
        targetRef: 'alice@alpha.test::m1',
        authorityLevel: 'R3',
        approvalRef: 'lead-1',
        policyVersion: 'v2026.11.01',
        executionMode: 'LIVE',
      });

      const keyA = await tenantSigner.getTenantPublicKey('tenant-alpha');
      const keyB = await tenantSigner.getTenantPublicKey('tenant-beta');
      expect(keyA.signingKeyId).not.toBe(keyB.signingKeyId);
      expect(keyA.publicKey).not.toBe(keyB.publicKey);

      // Re-targeting Tenant A's signed envelope to Tenant B must fail verification
      const crossTenantResult = await tenantSigner.verifyAndConsumeCommand({
        ...envA,
        tenantId: 'tenant-beta',
      });
      expect(crossTenantResult.valid).toBe(false);
      expect(crossTenantResult.reasonCode).toBe('REJECTED_TENANT_KEY_MISMATCH');

      // Legitimate verification succeeds once, then replay is rejected
      const ok = await tenantSigner.verifyAndConsumeCommand(envA);
      expect(ok).toEqual({ valid: true, reasonCode: 'VALID' });

      const replay = await tenantSigner.verifyAndConsumeCommand(envA);
      expect(replay).toEqual({
        valid: false,
        reasonCode: 'REJECTED_REPLAY_NONCE',
      });
    });

    it('rejects expired and tampered envelopes', async () => {
      const expired = await tenantSigner.signCommand({
        tenantId: 'tenant-alpha',
        proposalId: 'p-exp',
        actionType: 'PULL_BACK_MESSAGE',
        targetRef: 'alice@alpha.test::m2',
        authorityLevel: 'R3',
        approvalRef: 'lead-1',
        policyVersion: 'v2026.11.01',
        executionMode: 'LIVE',
        ttlSeconds: -5,
      });
      expect(await tenantSigner.verifyAndConsumeCommand(expired)).toEqual({
        valid: false,
        reasonCode: 'REJECTED_EXPIRED_COMMAND',
      });

      const tampered = await tenantSigner.signCommand({
        tenantId: 'tenant-alpha',
        proposalId: 'p-tamper',
        actionType: 'PULL_BACK_MESSAGE',
        targetRef: 'alice@alpha.test::m3',
        authorityLevel: 'R3',
        approvalRef: 'lead-1',
        policyVersion: 'v2026.11.01',
        executionMode: 'LIVE',
      });
      const res = await tenantSigner.verifyAndConsumeCommand({
        ...tampered,
        targetRef: 'ceo@alpha.test::m-forged',
      });
      expect(res).toEqual({
        valid: false,
        reasonCode: 'REJECTED_INVALID_SIGNATURE',
      });
    });

    it('fails closed in production when a tenant has no Cloud KMS signing key configured', async () => {
      const prevNodeEnv = process.env.NODE_ENV;
      const prevMap = process.env.EMAIL_ACTION_TENANT_KMS_KEYS_JSON;
      process.env.NODE_ENV = 'production';
      delete process.env.EMAIL_ACTION_TENANT_KMS_KEYS_JSON;
      try {
        const prodSigner = new PerTenantCommandSignerService();
        await expect(
          prodSigner.signCommand({
            tenantId: 'tenant-prod-unconfigured',
            proposalId: 'p-prod',
            actionType: 'QUARANTINE_MESSAGE',
            targetRef: 'alice@prod.test::m1',
            authorityLevel: 'R3',
            approvalRef: 'lead-1',
            policyVersion: 'v2026.11.01',
            executionMode: 'LIVE',
          }),
        ).rejects.toThrow(/TENANT_SIGNING_KEY_MISSING/);
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevMap !== undefined) {
          process.env.EMAIL_ACTION_TENANT_KMS_KEYS_JSON = prevMap;
        }
      }
    });
  });
});
