import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';

export type ToolSideEffectClass = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface ToolCapabilityGrant {
  grantId: string;
  agentPrincipal: string;
  tenantId: string;
  toolName: string;
  sideEffectClass: ToolSideEffectClass;
  resourceScope: string;
  issuedAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export const TOOL_REGISTRY: Record<
  string,
  { sideEffectClass: ToolSideEffectClass; description: string }
> = {
  'case.read': {
    sideEffectClass: 'T0',
    description: 'Read case metadata and state',
  },
  'evidence.read': {
    sideEffectClass: 'T0',
    description: 'Read case evidence ledger records',
  },
  'telemetry.query': {
    sideEffectClass: 'T0',
    description: 'Query tenant-scoped normalized telemetry',
  },
  'event.aggregate': {
    sideEffectClass: 'T1',
    description: 'Derived aggregation and correlation computation',
  },
  'draft_note.create': {
    sideEffectClass: 'T2',
    description: 'Create draft investigation note for human review',
  },
  'notification.draft': {
    sideEffectClass: 'T3',
    description: 'Draft external notification template',
  },
  'session.revoke_simulation': {
    sideEffectClass: 'T4',
    description: 'Simulate session revocation under R1 response authority',
  },
  'evidence.delete': {
    sideEffectClass: 'T5',
    description: 'PROHIBITED: Deleting evidence records',
  },
  'authorization.escalate': {
    sideEffectClass: 'T5',
    description: 'PROHIBITED: Self-elevating access permissions',
  },
};

/**
 * ZS-ENG-AI-001 §15: Tool Contracts, Capability Grants & Transaction Boundaries.
 * Issues short-lived, single-purpose capability grants. Rejection of T5 prohibited tools
 * is absolute and unconditional. Model output is never a permit.
 */
@Injectable()
export class ToolCapabilityService {
  private readonly logger = new Logger(ToolCapabilityService.name);
  private readonly activeGrants = new Map<string, ToolCapabilityGrant>();

  issueGrant(params: {
    agentPrincipal: string;
    tenantId: string;
    toolName: string;
    resourceScope: string;
    ttlSeconds?: number;
  }): ToolCapabilityGrant {
    const toolDef = TOOL_REGISTRY[params.toolName];
    const sideEffectClass = toolDef?.sideEffectClass ?? 'T5';

    if (sideEffectClass === 'T5') {
      throw new ForbiddenException(
        `Tool '${params.toolName}' is classified as T5 (Irreversible/Prohibited) and cannot be granted to AI agents under ZS-ENG-AI-001 §15`,
      );
    }

    const grantId = `grant-${crypto.randomUUID()}`;
    const issuedAt = new Date();
    const ttlMs = (params.ttlSeconds ?? 300) * 1000; // default 5 minutes
    const expiresAt = new Date(issuedAt.getTime() + ttlMs);

    const grant: ToolCapabilityGrant = {
      grantId,
      agentPrincipal: params.agentPrincipal,
      tenantId: params.tenantId,
      toolName: params.toolName,
      sideEffectClass,
      resourceScope: params.resourceScope,
      issuedAt,
      expiresAt,
      revoked: false,
    };

    this.activeGrants.set(grantId, grant);
    return grant;
  }

  verifyGrant(
    grantId: string,
    context: { tenantId: string; toolName: string },
  ): ToolCapabilityGrant {
    const grant = this.activeGrants.get(grantId);
    if (!grant) {
      throw new UnauthorizedException(
        `Capability grant '${grantId}' not found or already consumed`,
      );
    }

    if (grant.revoked) {
      throw new ForbiddenException(
        `Capability grant '${grantId}' has been revoked`,
      );
    }

    if (grant.expiresAt < new Date()) {
      this.activeGrants.delete(grantId);
      throw new UnauthorizedException(
        `Capability grant '${grantId}' has expired`,
      );
    }

    if (grant.tenantId !== context.tenantId) {
      throw new ForbiddenException(
        `Cross-tenant grant violation: grant belongs to tenant '${grant.tenantId}', attempted use by '${context.tenantId}'`,
      );
    }

    if (grant.toolName !== context.toolName) {
      throw new ForbiddenException(
        `Tool mismatch: grant is for '${grant.toolName}', attempted '${context.toolName}'`,
      );
    }

    return grant;
  }

  revokeGrant(grantId: string): void {
    const grant = this.activeGrants.get(grantId);
    if (grant) {
      grant.revoked = true;
      this.activeGrants.set(grantId, grant);
    }
  }
}
