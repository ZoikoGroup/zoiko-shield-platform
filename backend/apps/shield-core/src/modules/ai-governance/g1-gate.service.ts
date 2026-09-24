import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

export interface ApproverRoleStatus {
  roleId: string;
  roleTitle: string;
  domain: string;
  mandate: string;
  signatoryName?: string;
  isSigned: boolean;
  signedAt?: string;
  signatureProofRef?: string;
  evidenceNotes?: string;
}

export interface G1GateRosterStatus {
  releaseBaseline: string;
  gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF' | 'RATIFIED';
  totalApprovers: number;
  signedCount: number;
  missingRoles: string[];
  approvers: ApproverRoleStatus[];
  ratifiedAt?: string;
  failClosedLiveResponseEnforced: boolean;
}

export const CANONICAL_G1_ROLES: Omit<
  ApproverRoleStatus,
  | 'isSigned'
  | 'signatoryName'
  | 'signedAt'
  | 'signatureProofRef'
  | 'evidenceNotes'
>[] = [
  {
    roleId: 'ciso',
    roleTitle: 'Chief Information Security Officer',
    domain: 'Security Architecture & Threat Defense',
    mandate:
      'KMS key boundaries, cryptographic dual-signing, and zero ungrounded claims',
  },
  {
    roleId: 'dpo',
    roleTitle: 'Data Protection Officer',
    domain: 'Privacy & Data Governance',
    mandate:
      'Sovereign regional residency, WORM evidence retention, and GDPR/HIPAA compliance',
  },
  {
    roleId: 'vp_eng',
    roleTitle: 'VP of Engineering',
    domain: 'System Architecture & Engineering Integrity',
    mandate:
      'Single-stack NestJS/TypeScript ratification, Prisma SOR, and module boundaries',
  },
  {
    roleId: 'ai_risk_lead',
    roleTitle: 'AI Safety & Risk Committee Lead',
    domain: 'AI Safety & Decision Rights',
    mandate:
      '§17 domain-differentiated thresholds, §16.1 review envelopes, and PSI drift monitoring',
  },
  {
    roleId: 'qa_lead',
    roleTitle: 'Head of Quality Assurance & Verification',
    domain: 'Testing & Release Verification',
    mandate:
      '100% green test suites, zero regressions, and standalone offline verifier round-trip',
  },
  {
    roleId: 'sre_lead',
    roleTitle: 'Director of Site Reliability Engineering',
    domain: 'Infrastructure & Operational Resilience',
    mandate:
      'OpenTofu regional cell manifests, Prometheus/Grafana signals, and backup/restore',
  },
  {
    roleId: 'product_lead',
    roleTitle: 'VP of Product Management',
    domain: 'Commercial & Feature Scope',
    mandate:
      '4-tier commercial plan ladder, 6 sector defense packs, and customer disclosures',
  },
  {
    roleId: 'soc_lead',
    roleTitle: 'Head of Global SOC Operations',
    domain: 'Managed Defense & Operational Delivery',
    mandate:
      'Rule SVC-01 24/7 SOC staffing verification, SLA windows, and case workflows',
  },
];

@Injectable()
export class G1GateService {
  private readonly approverMap = new Map<string, ApproverRoleStatus>();
  private ratifiedTimestamp?: string;

  constructor() {
    this.resetRoster();
  }

  public resetRoster(): void {
    this.approverMap.clear();
    for (const role of CANONICAL_G1_ROLES) {
      this.approverMap.set(role.roleId, {
        ...role,
        isSigned: false,
      });
    }
    this.ratifiedTimestamp = undefined;
  }

  public getRosterStatus(): G1GateRosterStatus {
    const approvers = Array.from(this.approverMap.values());
    const signedCount = approvers.filter((a) => a.isSigned).length;
    const missingRoles = approvers
      .filter((a) => !a.isSigned)
      .map((a) => `${a.roleTitle} (${a.roleId})`);

    const isRatified =
      signedCount === approvers.length && approvers.length === 8;

    return {
      releaseBaseline: 'ERB-01 / G1 Gate',
      gateStatus: isRatified ? 'RATIFIED' : 'PENDING_MULTI_APPROVER_SIGNOFF',
      totalApprovers: approvers.length,
      signedCount,
      missingRoles,
      approvers,
      ratifiedAt: isRatified ? this.ratifiedTimestamp : undefined,
      failClosedLiveResponseEnforced: !isRatified,
    };
  }

  public recordSignature(input: {
    roleId: string;
    signatoryName: string;
    signatureProof: string;
    evidenceNotes?: string;
  }): ApproverRoleStatus {
    if (!input.roleId || !input.signatoryName || !input.signatureProof) {
      throw new BadRequestException(
        'roleId, signatoryName, and signatureProof are mandatory for G1 sign-off',
      );
    }

    const approver = this.approverMap.get(input.roleId);
    if (!approver) {
      throw new NotFoundException(
        `Role '${input.roleId}' is not a valid G1 canonical approver role. Must be one of: ${Array.from(this.approverMap.keys()).join(', ')}`,
      );
    }

    approver.isSigned = true;
    approver.signatoryName = input.signatoryName;
    approver.signedAt = new Date().toISOString();
    approver.signatureProofRef = input.signatureProof;
    approver.evidenceNotes =
      input.evidenceNotes || 'Reviewed and verified release evidence package.';

    this.approverMap.set(input.roleId, approver);

    // Check if all 8 are now signed
    const allSigned = Array.from(this.approverMap.values()).every(
      (a) => a.isSigned,
    );
    if (allSigned && !this.ratifiedTimestamp) {
      this.ratifiedTimestamp = new Date().toISOString();
    }

    return approver;
  }
}
