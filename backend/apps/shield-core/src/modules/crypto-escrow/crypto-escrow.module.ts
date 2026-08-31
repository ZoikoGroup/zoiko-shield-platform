import { Module } from '@nestjs/common';
import { SplitKmsEscrowService } from './split-kms-escrow.service';

@Module({
  providers: [SplitKmsEscrowService],
  exports: [SplitKmsEscrowService],
})
export class CryptoEscrowModule {}
