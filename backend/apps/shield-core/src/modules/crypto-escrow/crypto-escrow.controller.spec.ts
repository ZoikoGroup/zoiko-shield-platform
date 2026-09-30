import { Test, TestingModule } from '@nestjs/testing';
import { CryptoEscrowController } from './crypto-escrow.controller';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import { CustomerByokKmsProxyService } from './customer-byok-kms-proxy.service';
import { ConfidentialComputingAttestationService } from './confidential-computing-attestation.service';
import { MpcThresholdKeyRecoveryService } from './mpc-threshold-key-recovery.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('CryptoEscrowController', () => {
  let controller: CryptoEscrowController;
  let kmsHealthService: KmsHealthRebalancerService;
  let byokProxyService: CustomerByokKmsProxyService;
  let attestationService: ConfidentialComputingAttestationService;
  let mpcRecoveryService: MpcThresholdKeyRecoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CryptoEscrowController],
      providers: [
        KmsHealthRebalancerService,
        SplitKmsEscrowService,
        CustomerByokKmsProxyService,
        ConfidentialComputingAttestationService,
        MpcThresholdKeyRecoveryService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CryptoEscrowController>(CryptoEscrowController);
    kmsHealthService = module.get<KmsHealthRebalancerService>(
      KmsHealthRebalancerService,
    );
    byokProxyService = module.get<CustomerByokKmsProxyService>(
      CustomerByokKmsProxyService,
    );
    attestationService = module.get<ConfidentialComputingAttestationService>(
      ConfidentialComputingAttestationService,
    );
    mpcRecoveryService = module.get<MpcThresholdKeyRecoveryService>(
      MpcThresholdKeyRecoveryService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get KMS health status', () => {
    const res = controller.getKmsHealth();
    expect(res.statusCode).toBe(200);
    expect(res.data.primaryProvider).toBeDefined();
  });

  it('should configure and get BYOK status', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const configureRes = await controller.configureByok(tenantId, {
      provider: 'AWS_KMS',
      keyUri: 'arn:aws:kms:us-east-1:123456789012:key/test',
      keyAlias: 'aws-test-key',
    });
    expect(configureRes.statusCode).toBe(200);
    expect(configureRes.data.provider).toBe('AWS_KMS');

    const statusRes = await controller.getByokStatus(tenantId);
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.data.keyAlias).toBe('aws-test-key');
  });

  it('should verify hardware attestation', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const res = await controller.verifyHardwareAttestation(tenantId, {
      platformType: 'AMD_SEV_SNP',
      quoteOrReportHex:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      nonce: 'n-123',
      hostIdentifier: 'host-01',
    });

    expect(res.statusCode).toBe(200);
    expect(res.data.verificationStatus).toBe('VERIFIED_GENUINE');
  });

  it('should split and recover MPC key', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const splitRes = await controller.splitMpcKey(tenantId, {
      keyAlias: 'mpc-master',
      threshold: 3,
      totalShares: 5,
    });
    expect(splitRes.statusCode).toBe(200);
    expect(splitRes.data.shares.length).toBe(5);

    const recRes = await controller.recoverMpcKey(tenantId, {
      splitId: splitRes.data.splitId,
      submittedShares: splitRes.data.shares.slice(0, 3),
    });
    expect(recRes.statusCode).toBe(200);
    expect(recRes.data.status).toBe('RECOVERED_SUCCESSFULLY');
  });
});
