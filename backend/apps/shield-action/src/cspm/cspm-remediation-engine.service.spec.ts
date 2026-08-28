import { CspmRemediationEngineService } from './cspm-remediation-engine.service';

describe('CspmRemediationEngineService', () => {
  let cspmService: CspmRemediationEngineService;

  beforeEach(() => {
    cspmService = new CspmRemediationEngineService();
  });

  it('should automatically remediate public S3 bucket and issue cryptographic receipt with rollback snapshot', () => {
    const finding = {
      findingId: 'cspm-drift-01',
      tenantId: 'tenant-enterprise-01',
      cloudProvider: 'AWS' as const,
      violationType: 'AWS_S3_PUBLIC_READ_WRITE' as const,
      resourceArn: 'arn:aws:s3:::customer-confidential-backups',
      detectedAt: new Date().toISOString(),
    };

    const receipt = cspmService.remediateMisconfiguration(finding);

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.status).toBe('SELF_HEALING_APPLIED_SUCCESS');
    expect(receipt.remediationAction).toBe('s3:PutPublicAccessBlock');
    expect(receipt.rollbackStateSnapshot).toBeDefined();
    expect(receipt.attestationDigest).toBeDefined();
  });

  it('should automatically remediate open AWS security group ingress', () => {
    const finding = {
      findingId: 'cspm-drift-02',
      tenantId: 'tenant-enterprise-01',
      cloudProvider: 'AWS' as const,
      violationType: 'AWS_SECURITY_GROUP_OPEN_INGRESS' as const,
      resourceArn: 'arn:aws:ec2:us-east-1:123456789012:security-group/sg-019283019283',
      detectedAt: new Date().toISOString(),
    };

    const receipt = cspmService.remediateMisconfiguration(finding);
    expect(receipt.remediationAction).toBe('ec2:RevokeSecurityGroupIngress');
    expect(receipt.status).toBe('SELF_HEALING_APPLIED_SUCCESS');
  });
});
