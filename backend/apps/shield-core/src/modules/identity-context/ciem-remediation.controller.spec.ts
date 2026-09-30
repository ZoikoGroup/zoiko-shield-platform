import { Test, TestingModule } from '@nestjs/testing';
import { CiemRemediationController } from './ciem-remediation.controller';
import { CiemLeastPrivilegeService } from './ciem-least-privilege.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('CiemRemediationController', () => {
  let controller: CiemRemediationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CiemRemediationController],
      providers: [CiemLeastPrivilegeService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CiemRemediationController>(
      CiemRemediationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should analyze role via controller', () => {
    const res = controller.analyzeRole('tenant-ciem-01', {
      provider: 'AWS_IAM',
      roleArnOrId: 'arn:aws:iam::123456789012:role/TestRole',
      assignedPermissions: ['s3:GetObject', 'ec2:*'],
      last90DaysUsedPermissions: ['s3:GetObject'],
    });

    expect(res.statusCode).toBe(200);
    expect(res.data.overPrivilegedScorePercent).toBe(50);
    expect(res.data.excessPermissionsToRevoke).toEqual(['ec2:*']);
  });
});
