import { Module } from '@nestjs/common';
import { CryptographicShreddingService } from './cryptographic-shredding.service';

@Module({
  providers: [CryptographicShreddingService],
  exports: [CryptographicShreddingService],
})
export class PrivacyModule {}
