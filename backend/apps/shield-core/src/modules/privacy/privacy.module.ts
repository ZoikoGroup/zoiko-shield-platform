import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptographicShreddingService } from './cryptographic-shredding.service';

@Module({
  imports: [PrismaModule],
  providers: [CryptographicShreddingService],
  exports: [CryptographicShreddingService],
})
export class PrivacyModule {}
