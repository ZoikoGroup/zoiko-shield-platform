import { Module } from '@nestjs/common';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import { KmsHealthRebalancerService } from './kms-health-rebalancer.service';
import { CryptoEscrowController } from './crypto-escrow.controller';

@Module({
  controllers: [CryptoEscrowController],
  providers: [SplitKmsEscrowService, KmsHealthRebalancerService],
  exports: [SplitKmsEscrowService, KmsHealthRebalancerService],
})
export class CryptoEscrowModule {}
