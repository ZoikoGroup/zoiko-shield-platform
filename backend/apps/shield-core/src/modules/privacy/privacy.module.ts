import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptographicShreddingService } from './cryptographic-shredding.service';
import { DynamicTokenizationProxyService } from './dynamic-tokenization-proxy.service';

@Module({
  imports: [PrismaModule],
  providers: [CryptographicShreddingService, DynamicTokenizationProxyService],
  exports: [CryptographicShreddingService, DynamicTokenizationProxyService],
})
export class PrivacyModule {}
