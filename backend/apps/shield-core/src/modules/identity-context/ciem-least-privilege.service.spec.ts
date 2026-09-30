import { Test, TestingModule } from '@nestjs/testing';
import {
  CiemLeastPrivilegeService,
  CiemRoleAnalysisRequest,
} from './ciem-least-privilege.service';

describe('CiemLeastPrivilegeService', () => {
  let service: CiemLeastPrivilegeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CiemLeastPrivilegeService],
    }).compile();

    service = module.get<CiemLeastPrivilegeService>(CiemLeastPrivilegeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate overprivileged percentage and generate remediation HCL diff', () => {
    const request: CiemRoleAnalysisRequest = {
      tenantId: 'tenant-cloud-01',
      provider: 'AWS_IAM',
      roleArnOrId: 'arn:aws:iam::123456789012:role/OverPrivilegedAppRole',
      assignedPermissions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteBucket',
        'iam:PassRole',
        'ec2:*',
      ],
      last90DaysUsedPermissions: ['s3:GetObject', 's3:PutObject'],
    };

    const diff = service.analyzeRoleEntitlements(request);

    expect(diff.overPrivilegedScorePercent).toBe(60);
    expect(diff.excessPermissionsToRevoke).toEqual([
      's3:DeleteBucket',
      'iam:PassRole',
      'ec2:*',
    ]);
    expect(diff.retainedLeastPrivilegePermissions).toEqual([
      's3:GetObject',
      's3:PutObject',
    ]);
    expect(diff.status).toBe('REMEDIATION_RECOMMENDED');
    expect(diff.remediationHclTerraformDiff).toContain('aws_iam_policy');
  });
});
