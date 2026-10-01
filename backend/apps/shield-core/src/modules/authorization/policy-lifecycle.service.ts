import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import * as yaml from 'js-yaml';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PolicyDomain,
  StagePolicyDto,
  RollbackPolicyDto,
} from './dto/policy-lifecycle.dto';

export interface PolicyVersionRecord {
  id: string;
  tenantId: string;
  policyName: string;
  domain: PolicyDomain;
  version: string;
  status: string;
  stagedEnvironment: string | null;
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
  reversalReason?: string | null;
}

export interface PolicySimulationReport {
  policyId: string;
  simulatedAt: string;
  syntaxValid: boolean;
  parseError?: string;
  changedKeys: string[];
  unchangedKeys: string[];
}

export interface PolicyAuditEventRecord {
  id: string;
  action: string;
  actorId: string;
  detail: string;
  occurredAt: string;
}

/**
 * W12 (Spec §619: "Draft/diff, scope, impact, approvers, test/simulation,
 * staged deployment, effective version, rollback and audit record").
 *
 * Previously held entirely in an in-process Map: every approval and
 * rollback decision was lost on restart, and two replicas would disagree
 * about which policies were active. Now backed by
 * authorization.config_policy_versions/config_policy_audit_events
 * (tenant row-level security, not the control_plane exemption the rest of
 * "authorization" uses - see that schema file's header comment).
 *
 * "id" in every record returned to callers is the stable policyKey, not the
 * row's database id: a tenant's first lifecycle action on a shared baseline
 * forks a tenant-owned row with its own database id, and callers must keep
 * addressing the same policy across that fork.
 */
@Injectable()
export class PolicyLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(PolicyLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly canonicalSeeds: Array<{
    policyKey: string;
    policyName: string;
    domain: PolicyDomain;
    version: string;
    status: string;
    stagedEnvironment: string;
    canaryPercentage: number;
    author: string;
    approvers: string[];
    commitHash: string;
    diffSummary: string;
    diffPrevious: string;
    diffProposed: string;
  }> = [
    {
      policyKey: 'pol-2026-09-001',
      policyName: 'Zero-Trust JIT Admin Escalation Policy',
      domain: 'IAM',
      version: 'v2.4.1',
      status: 'PENDING_APPROVAL',
      stagedEnvironment: 'staging-eu-west3',
      canaryPercentage: 10,
      author: 'security-architect@zoikoshield.corp',
      approvers: ['soc-lead@zoikoshield.corp'],
      commitHash: '7f9a2c14e0b',
      diffSummary:
        'Enforces 4-eyes approval on R3 actions and caps JIT session TTL to 30 minutes in regional cells.',
      diffPrevious: `version: 2.4.0\njit_elevation:\n  max_session_ttl_minutes: 60\n  auto_approval_roles: ["SOC_ANALYST_L3"]\n  mfa_required: true\n  passkey_stepup: optional\nresponse_governance:\n  r3_autonomous_allowed: false`,
      diffProposed: `version: 2.4.1\njit_elevation:\n  max_session_ttl_minutes: 30\n  auto_approval_roles: []\n  mfa_required: true\n  passkey_stepup: strict_webauthn\nresponse_governance:\n  r3_autonomous_allowed: false\n  four_eyes_quorum: 2`,
    },
    {
      policyKey: 'pol-2026-09-002',
      policyName: 'Regional EU Cell Sovereignty & Residency Fence',
      domain: 'RESIDENCY',
      version: 'v3.1.0',
      status: 'ACTIVE',
      stagedEnvironment: 'production-eu-west3',
      canaryPercentage: 100,
      author: 'dpo-compliance@zoikoshield.corp',
      approvers: ['ciso@zoikoshield.corp', 'lead-sre@zoikoshield.corp'],
      commitHash: '3a88d72e911',
      diffSummary:
        'Strict fail-closed cross-border route dropping for EU tenant evidence objects.',
      diffPrevious: `data_residency:\n  region: europe-west3\n  fail_open_on_outage: true`,
      diffProposed: `data_residency:\n  region: europe-west3\n  fail_open_on_outage: false\n  immutable_retention_locked: true`,
    },
    {
      policyKey: 'pol-2026-09-003',
      policyName: 'Autonomous EDR Action Blast-Radius Governor',
      domain: 'RESPONSE',
      version: 'v1.8.4',
      status: 'STAGED',
      stagedEnvironment: 'canary-prod-us',
      canaryPercentage: 25,
      author: 'secops-engineer@zoikoshield.corp',
      approvers: ['soc-lead@zoikoshield.corp'],
      commitHash: 'c4e5108b29f',
      diffSummary:
        'Caps automatic host network isolation to maximum 5 endpoints per 10-minute window.',
      diffPrevious: `soar_guardrails:\n  max_isolated_hosts_per_window: 20\n  blast_radius_threshold: 0.65`,
      diffProposed: `soar_guardrails:\n  max_isolated_hosts_per_window: 5\n  blast_radius_threshold: 0.40\n  compensating_rollback_timeout_seconds: 300`,
    },
    {
      policyKey: 'pol-2026-09-004',
      policyName: 'High-Throughput Stream Anomaly Detection Window',
      domain: 'DETECTION',
      version: 'v4.0.2',
      status: 'ACTIVE',
      stagedEnvironment: 'production-global',
      canaryPercentage: 100,
      author: 'detection-lead@zoikoshield.corp',
      approvers: ['ciso@zoikoshield.corp'],
      commitHash: '8e1b402a901',
      diffSummary:
        'Reduces Kafka Tier-A windowed auth failure burst threshold from 10 to 5 events.',
      diffPrevious: `detection_rules:\n  tier_a_auth_burst:\n    threshold: 10\n    window_seconds: 60`,
      diffProposed: `detection_rules:\n  tier_a_auth_burst:\n    threshold: 5\n    window_seconds: 60\n    auto_escalate_severity: HIGH`,
    },
  ];

  /** Platform-wide baseline, not per-tenant: runs once at boot, idempotent. */
  async onModuleInit(): Promise<void> {
    for (const seed of this.canonicalSeeds) {
      const existing = await this.prisma.configPolicyVersion.findFirst({
        where: { tenantId: null, policyKey: seed.policyKey },
      });
      if (existing) continue;
      await this.prisma.configPolicyVersion.create({
        data: { tenantId: null, ...seed },
      });
      this.logger.log(`Seeded canonical policy '${seed.policyKey}'`);
    }
  }

  private toRecord(
    row: Awaited<
      ReturnType<typeof this.prisma.configPolicyVersion.findFirstOrThrow>
    >,
    tenantId: string,
  ): PolicyVersionRecord {
    return {
      id: row.policyKey,
      tenantId,
      policyName: row.policyName,
      domain: row.domain as PolicyDomain,
      version: row.version,
      status: row.status,
      stagedEnvironment: row.stagedEnvironment,
      canaryPercentage: row.canaryPercentage,
      author: row.author,
      approvers: row.approvers,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      commitHash: row.commitHash,
      diffSummary: row.diffSummary,
      diffContent: { previous: row.diffPrevious, proposed: row.diffProposed },
      reversalReason: row.reversalReason,
    };
  }

  async listPolicies(
    tenantId: string,
    domain?: PolicyDomain,
  ): Promise<PolicyVersionRecord[]> {
    const rows = await this.prisma.configPolicyVersion.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(domain ? { domain } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    // A tenant fork shadows the global baseline it was forked from.
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = byKey.get(row.policyKey);
      if (!current || row.tenantId === tenantId) byKey.set(row.policyKey, row);
    }
    return [...byKey.values()]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((row) => this.toRecord(row, tenantId));
  }

  private async findRow(tenantId: string, policyKey: string) {
    const tenantRow = await this.prisma.configPolicyVersion.findUnique({
      where: { tenantId_policyKey: { tenantId, policyKey } },
    });
    if (tenantRow) return tenantRow;
    return this.prisma.configPolicyVersion.findFirst({
      where: { tenantId: null, policyKey },
    });
  }

  async getPolicyById(
    tenantId: string,
    policyKey: string,
  ): Promise<PolicyVersionRecord> {
    const row = await this.findRow(tenantId, policyKey);
    if (!row) throw new NotFoundException(`Policy '${policyKey}' not found`);
    return this.toRecord(row, tenantId);
  }

  /** Forks the shared baseline into a tenant-owned row on first mutation. */
  private async resolveForWrite(tenantId: string, policyKey: string) {
    const row = await this.findRow(tenantId, policyKey);
    if (!row) throw new NotFoundException(`Policy '${policyKey}' not found`);
    if (row.tenantId === tenantId) return row;
    return this.prisma.configPolicyVersion.create({
      data: {
        tenantId,
        policyKey: row.policyKey,
        policyName: row.policyName,
        domain: row.domain,
        version: row.version,
        status: row.status,
        stagedEnvironment: row.stagedEnvironment,
        canaryPercentage: row.canaryPercentage,
        author: row.author,
        approvers: row.approvers,
        commitHash: row.commitHash,
        diffSummary: row.diffSummary,
        diffPrevious: row.diffPrevious,
        diffProposed: row.diffProposed,
      },
    });
  }

  private recordAudit(
    tenantId: string,
    policyVersionId: string,
    action: string,
    actorId: string,
    detail: string,
  ) {
    return this.prisma.configPolicyAuditEvent.create({
      data: { tenantId, policyVersionId, action, actorId, detail },
    });
  }

  async listAuditEvents(
    tenantId: string,
    policyKey: string,
  ): Promise<PolicyAuditEventRecord[]> {
    const row = await this.findRow(tenantId, policyKey);
    if (!row) throw new NotFoundException(`Policy '${policyKey}' not found`);
    const events = await this.prisma.configPolicyAuditEvent.findMany({
      where: { policyVersionId: row.id },
      orderBy: { occurredAt: 'desc' },
    });
    return events.map((e) => ({
      id: e.id,
      action: e.action,
      actorId: e.actorId,
      detail: e.detail,
      occurredAt: e.occurredAt.toISOString(),
    }));
  }

  /**
   * The "test/simulation" step §619 requires. Real, bounded validation: the
   * proposed diff must parse as YAML, and the report names which top-level
   * keys actually changed - it does not run the YAML against a live policy
   * engine for any of the four domains, and says so in its own shape rather
   * than implying a dry-run it did not perform.
   */
  async simulatePolicy(
    tenantId: string,
    policyKey: string,
    actorId: string,
  ): Promise<PolicySimulationReport> {
    const row = await this.findRow(tenantId, policyKey);
    if (!row) throw new NotFoundException(`Policy '${policyKey}' not found`);

    let syntaxValid = true;
    let parseError: string | undefined;
    const changedKeys: string[] = [];
    const unchangedKeys: string[] = [];
    try {
      const previous = (yaml.load(row.diffPrevious) ?? {}) as Record<
        string,
        unknown
      >;
      const proposed = (yaml.load(row.diffProposed) ?? {}) as Record<
        string,
        unknown
      >;
      const keys = new Set([
        ...Object.keys(previous),
        ...Object.keys(proposed),
      ]);
      for (const key of keys) {
        const same =
          JSON.stringify(previous[key]) === JSON.stringify(proposed[key]);
        (same ? unchangedKeys : changedKeys).push(key);
      }
    } catch (err) {
      syntaxValid = false;
      parseError = err instanceof Error ? err.message : String(err);
    }

    await this.recordAudit(
      tenantId,
      row.id,
      'SIMULATED',
      actorId,
      syntaxValid
        ? `Syntax valid; ${changedKeys.length} top-level key(s) changed: ${changedKeys.join(', ') || 'none'}`
        : `Syntax invalid: ${parseError}`,
    );

    return {
      policyId: policyKey,
      simulatedAt: new Date().toISOString(),
      syntaxValid,
      parseError,
      changedKeys,
      unchangedKeys,
    };
  }

  async stagePolicy(
    tenantId: string,
    policyKey: string,
    dto: StagePolicyDto,
    actorId: string,
  ): Promise<PolicyVersionRecord> {
    const row = await this.resolveForWrite(tenantId, policyKey);
    const status = dto.canaryPercentage === 100 ? 'ACTIVE' : 'STAGED';
    const updated = await this.prisma.configPolicyVersion.update({
      where: { id: row.id },
      data: {
        stagedEnvironment: dto.stagedEnvironment,
        canaryPercentage: dto.canaryPercentage,
        status,
      },
    });
    await this.recordAudit(
      tenantId,
      row.id,
      'STAGED',
      actorId,
      `Staged to '${dto.stagedEnvironment}' at ${dto.canaryPercentage}% (status -> ${status})`,
    );
    return this.toRecord(updated, tenantId);
  }

  async approvePolicy(
    tenantId: string,
    policyKey: string,
    approverId: string,
  ): Promise<PolicyVersionRecord> {
    const row = await this.resolveForWrite(tenantId, policyKey);
    if (row.approvers.includes(approverId)) {
      throw new BadRequestException(
        `Approver '${approverId}' has already signed off on policy '${policyKey}'`,
      );
    }
    const approvers = [...row.approvers, approverId];
    const status = approvers.length >= 2 ? 'ACTIVE' : 'PENDING_APPROVAL';
    const updated = await this.prisma.configPolicyVersion.update({
      where: { id: row.id },
      data: { approvers, status },
    });
    await this.recordAudit(
      tenantId,
      row.id,
      'APPROVED',
      approverId,
      `Approval ${approvers.length} recorded (status -> ${status})`,
    );
    return this.toRecord(updated, tenantId);
  }

  async rollbackPolicy(
    tenantId: string,
    policyKey: string,
    dto: RollbackPolicyDto,
    actorId: string,
  ): Promise<PolicyVersionRecord> {
    const row = await this.resolveForWrite(tenantId, policyKey);
    const updated = await this.prisma.configPolicyVersion.update({
      where: { id: row.id },
      data: {
        status: 'ROLLED_BACK',
        canaryPercentage: 0,
        reversalReason: dto.reason,
      },
    });
    await this.recordAudit(
      tenantId,
      row.id,
      'ROLLED_BACK',
      actorId,
      `Rolled back: ${dto.reason}`,
    );
    return this.toRecord(updated, tenantId);
  }
}
