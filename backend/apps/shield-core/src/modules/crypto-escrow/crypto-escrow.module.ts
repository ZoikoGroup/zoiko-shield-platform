import { Module } from '@nestjs/common';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';
import { CustomerByokKmsProxyService } from './customer-byok-kms-proxy.service';
import { ConfidentialComputingAttestationService } from './confidential-computing-attestation.service';
import { MpcThresholdKeyRecoveryService } from './mpc-threshold-key-recovery.service';
import { CryptoEscrowController } from './crypto-escrow.controller';

@Module({
  controllers: [CryptoEscrowController],
  providers: [
    SplitKmsEscrowService,
    KmsHealthRebalancerService,
    CustomerByokKmsProxyService,
    ConfidentialComputingAttestationService,
    MpcThresholdKeyRecoveryService,
  ],
  exports: [
    SplitKmsEscrowService,
    KmsHealthRebalancerService,
    CustomerByokKmsProxyService,
    ConfidentialComputingAttestationService,
    MpcThresholdKeyRecoveryService,
  ],
})
export class CryptoEscrowModule {}
