import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type CloudProviderType = 'AWS_IAM' | 'GCP_IAM' | 'AZURE_RBAC';

export interface CiemRoleAnalysisRequest {
  tenantId: string;
  provider: CloudProviderType;
  roleArnOrId: string;
  assignedPermissions: string[];
  last90DaysUsedPermissions: string[];
}

export interface CiemLeastPrivilegePolicyDiff {
  analysisId: string;
  tenantId: string;
  provider: CloudProviderType;
  roleArnOrId: string;
  overPrivilegedScorePercent: number;
  excessPermissionsToRevoke: string[];
  retainedLeastPrivilegePermissions: string[];
  remediationHclTerraformDiff: string;
  status: 'REMEDIATION_RECOMMENDED' | 'LEAST_PRIVILEGE_COMPLIANT';
  analyzedAt: string;
}

@Injectable()
export class CiemLeastPrivilegeService {
  private readonly logger = new Logger(CiemLeastPrivilegeService.name);

  /**
   * Analyzes an IAM role for excess permissions and computes least-privilege policy diff.
   */
  analyzeRoleEntitlements(
    req: CiemRoleAnalysisRequest,
  ): CiemLeastPrivilegePolicyDiff {
    if (!req.tenantId || !req.roleArnOrId) {
      throw new BadRequestException('Tenant ID and Role ARN/ID are required.');
    }

    const analysisId = `ciem-eval-${randomUUID()}`;
    const assignedSet = new Set(req.assignedPermissions);
    const usedSet = new Set(req.last90DaysUsedPermissions);

    const excessPermissions = req.assignedPermissions.filter(
      (p) => !usedSet.has(p),
    );
    const retainedPermissions = req.assignedPermissions.filter((p) =>
      usedSet.has(p),
    );

    const totalAssigned = Math.max(1, req.assignedPermissions.length);
    const overPrivilegedScore = Math.round(
      (excessPermissions.length / totalAssigned) * 100,
    );

    const terraformDiff = `
# ZoikoShield CIEM Least-Privilege Remediation for ${req.roleArnOrId}
# Generated on: ${new Date().toISOString()}
resource "${req.provider === 'AWS_IAM' ? 'aws_iam_policy' : 'google_project_iam_custom_role'}" "least_privilege" {
  name = "remediated-${req.roleArnOrId.split('/').pop()}"
  permissions = [
${retainedPermissions.map((p) => `    "${p}",`).join('\n')}
  ]
}
`.trim();

    const status =
      excessPermissions.length > 0
        ? 'REMEDIATION_RECOMMENDED'
        : 'LEAST_PRIVILEGE_COMPLIANT';

    this.logger.log(
      `[CIEM_ROLE_ANALYZED] Tenant '${req.tenantId}' Role '${req.roleArnOrId}'. Excess perms: ${excessPermissions.length}, Overprivileged: ${overPrivilegedScore}%`,
    );

    return {
      analysisId,
      tenantId: req.tenantId,
      provider: req.provider,
      roleArnOrId: req.roleArnOrId,
      overPrivilegedScorePercent: overPrivilegedScore,
      excessPermissionsToRevoke: excessPermissions,
      retainedLeastPrivilegePermissions: retainedPermissions,
      remediationHclTerraformDiff: terraformDiff,
      status,
      analyzedAt: new Date().toISOString(),
    };
  }
}
