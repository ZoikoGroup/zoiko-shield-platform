import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PolicyDomain,
  PolicyLifecycleStatus,
  StagePolicyDto,
  RollbackPolicyDto,
} from './dto/policy-lifecycle.dto';

export interface PolicyVersionRecord {
  id: string;
  tenantId: string;
  policyName: string;
  domain: PolicyDomain;
  version: string;
  status: PolicyLifecycleStatus;
  stagedEnvironment: string;
  canaryPercentage: number;
  author: string;
  approvers: string[];
  createdAt: string;
  updatedAt: string;
  commitHash: string;
  diffSummary: string;
  diffContent: {
    previous: string;
    proposed: string;
  };
  reversalReason?: string;
}

@Injectable()
export class PolicyLifecycleService {
  private readonly logger = new Logger(PolicyLifecycleService.name);

  // In-memory tenant policy version store with canonical defaults
  private readonly policies = new Map<string, PolicyVersionRecord>();

  constructor() {
    this.seedCanonicalPolicies();
  }

  private seedCanonicalPolicies() {
    const seedData: Array<Omit<PolicyVersionRecord, 'tenantId'>> = [
      {
        id: 'pol-2026-09-001',
        policyName: 'Zero-Trust JIT Admin Escalation Policy',
        domain: 'IAM',
        version: 'v2.4.1',
        status: 'PENDING_APPROVAL',
        stagedEnvironment: 'staging-eu-west3',
        canaryPercentage: 10,
        author: 'security-architect@zoikoshield.corp',
        approvers: ['soc-lead@zoikoshield.corp'],
        createdAt: '2026-09-24T18:32:00.000Z',
        updatedAt: '2026-09-24T18:32:00.000Z',
        commitHash: '7f9a2c14e0b',
        diffSummary:
          'Enforces 4-eyes approval on R3 actions and caps JIT session TTL to 30 minutes in regional cells.',
        diffContent: {
          previous: `version: 2.4.0\njit_elevation:\n  max_session_ttl_minutes: 60\n  auto_approval_roles: ["SOC_ANALYST_L3"]\n  mfa_required: true\n  passkey_stepup: optional\nresponse_governance:\n  r3_autonomous_allowed: false`,
          proposed: `version: 2.4.1\njit_elevation:\n  max_session_ttl_minutes: 30\n  auto_approval_roles: [] # Deprecated auto-approval\n  mfa_required: true\n  passkey_stepup: strict_webauthn\nresponse_governance:\n  r3_autonomous_allowed: false\n  four_eyes_quorum: 2`,
        },
      },
      {
        id: 'pol-2026-09-002',
        policyName: 'Regional EU Cell Sovereignty & Residency Fence',
        domain: 'RESIDENCY',
        version: 'v3.1.0',
        status: 'ACTIVE',
        stagedEnvironment: 'production-eu-west3',
        canaryPercentage: 100,
        author: 'dpo-compliance@zoikoshield.corp',
        approvers: ['ciso@zoikoshield.corp', 'lead-sre@zoikoshield.corp'],
        createdAt: '2026-09-22T10:15:00.000Z',
        updatedAt: '2026-09-22T10:15:00.000Z',
        commitHash: '3a88d72e911',
        diffSummary:
          'Strict fail-closed cross-border route dropping for EU tenant evidence objects.',
        diffContent: {
          previous: `data_residency:\n  region: europe-west3\n  fail_open_on_outage: true`,
          proposed: `data_residency:\n  region: europe-west3\n  fail_open_on_outage: false # Strict fail-closed\n  immutable_retention_locked: true`,
        },
      },
      {
        id: 'pol-2026-09-003',
        policyName: 'Autonomous EDR Action Blast-Radius Governor',
        domain: 'RESPONSE',
        version: 'v1.8.4',
        status: 'STAGED',
        stagedEnvironment: 'canary-prod-us',
        canaryPercentage: 25,
        author: 'secops-engineer@zoikoshield.corp',
        approvers: ['soc-lead@zoikoshield.corp'],
        createdAt: '2026-09-20T14:40:00.000Z',
        updatedAt: '2026-09-20T14:40:00.000Z',
        commitHash: 'c4e5108b29f',
        diffSummary:
          'Caps automatic host network isolation to maximum 5 endpoints per 10-minute window.',
        diffContent: {
          previous: `soar_guardrails:\n  max_isolated_hosts_per_window: 20\n  blast_radius_threshold: 0.65`,
          proposed: `soar_guardrails:\n  max_isolated_hosts_per_window: 5\n  blast_radius_threshold: 0.40\n  compensating_rollback_timeout_seconds: 300`,
        },
      },
      {
        id: 'pol-2026-09-004',
        policyName: 'High-Throughput Stream Anomaly Detection Window',
        domain: 'DETECTION',
        version: 'v4.0.2',
        status: 'ACTIVE',
        stagedEnvironment: 'production-global',
        canaryPercentage: 100,
        author: 'detection-lead@zoikoshield.corp',
        approvers: ['ciso@zoikoshield.corp'],
        createdAt: '2026-09-18T09:00:00.000Z',
        updatedAt: '2026-09-18T09:00:00.000Z',
        commitHash: '8e1b402a901',
        diffSummary:
          'Reduces Kafka Tier-A windowed auth failure burst threshold from 10 to 5 events.',
        diffContent: {
          previous: `detection_rules:\n  tier_a_auth_burst:\n    threshold: 10\n    window_seconds: 60`,
          proposed: `detection_rules:\n  tier_a_auth_burst:\n    threshold: 5\n    window_seconds: 60\n    auto_escalate_severity: HIGH`,
        },
      },
    ];

    for (const p of seedData) {
      this.policies.set(`global:${p.id}`, {
        ...p,
        tenantId: 'global',
      });
    }
  }

  private getKey(tenantId: string, policyId: string): string {
    if (this.policies.has(`${tenantId}:${policyId}`)) {
      return `${tenantId}:${policyId}`;
    }
    if (this.policies.has(`global:${policyId}`)) {
      return `global:${policyId}`;
    }
    return `${tenantId}:${policyId}`;
  }

  listPolicies(tenantId: string, domain?: PolicyDomain): PolicyVersionRecord[] {
    const list: PolicyVersionRecord[] = [];
    for (const [key, p] of this.policies.entries()) {
      if (p.tenantId === tenantId || p.tenantId === 'global') {
        if (!domain || p.domain === domain) {
          list.push(p);
        }
      }
    }
    return list.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  getPolicyById(tenantId: string, policyId: string): PolicyVersionRecord {
    const key = this.getKey(tenantId, policyId);
    const policy = this.policies.get(key);
    if (!policy) {
      throw new NotFoundException(`Policy '${policyId}' not found`);
    }
    return policy;
  }

  stagePolicy(
    tenantId: string,
    policyId: string,
    dto: StagePolicyDto,
    operator: string,
  ): PolicyVersionRecord {
    const existing = this.getPolicyById(tenantId, policyId);
    const updated: PolicyVersionRecord = {
      ...existing,
      tenantId,
      stagedEnvironment: dto.stagedEnvironment,
      canaryPercentage: dto.canaryPercentage,
      status: dto.canaryPercentage === 100 ? 'ACTIVE' : 'STAGED',
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(`${tenantId}:${policyId}`, updated);
    this.logger.log(
      `[POLICY STAGED] Tenant '${tenantId}' policy '${policyId}' staged to '${dto.stagedEnvironment}' at ${dto.canaryPercentage}% by '${operator}'`,
    );
    return updated;
  }

  approvePolicy(
    tenantId: string,
    policyId: string,
    approverPrincipalId: string,
  ): PolicyVersionRecord {
    const existing = this.getPolicyById(tenantId, policyId);
    if (existing.approvers.includes(approverPrincipalId)) {
      throw new BadRequestException(
        `Approver '${approverPrincipalId}' has already signed off on policy '${policyId}'`,
      );
    }
    const approvers = [...existing.approvers, approverPrincipalId];
    // If dual custody (>= 2 approvers) reached, mark as ACTIVE
    const newStatus: PolicyLifecycleStatus =
      approvers.length >= 2 ? 'ACTIVE' : 'PENDING_APPROVAL';

    const updated: PolicyVersionRecord = {
      ...existing,
      tenantId,
      approvers,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(`${tenantId}:${policyId}`, updated);
    this.logger.log(
      `[POLICY APPROVED] Tenant '${tenantId}' policy '${policyId}' approved by '${approverPrincipalId}' (Total approvers: ${approvers.length}, Status: ${newStatus})`,
    );
    return updated;
  }

  rollbackPolicy(
    tenantId: string,
    policyId: string,
    dto: RollbackPolicyDto,
    operator: string,
  ): PolicyVersionRecord {
    const existing = this.getPolicyById(tenantId, policyId);
    const updated: PolicyVersionRecord = {
      ...existing,
      tenantId,
      status: 'ROLLED_BACK',
      canaryPercentage: 0,
      reversalReason: dto.reason,
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(`${tenantId}:${policyId}`, updated);
    this.logger.warn(
      `[POLICY ROLLED BACK] Tenant '${tenantId}' policy '${policyId}' rolled back by '${operator}'. Reason: ${dto.reason}`,
    );
    return updated;
  }
}
