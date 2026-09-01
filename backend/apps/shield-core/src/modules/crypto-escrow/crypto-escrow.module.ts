import { Module } from '@nestjs/common';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';

@Module({
  providers: [SplitKmsEscrowService, KmsHealthRebalancerService],
  exports: [SplitKmsEscrowService, KmsHealthRebalancerService],
})
export class CryptoEscrowModule {}
