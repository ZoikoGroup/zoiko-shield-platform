import { Module } from '@nestjs/common';
import {
  PlatformSectorPackController,
  SectorPackAvailabilityController,
} from './sector-pack.controller';
import { SectorPackService } from './sector-pack.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [PlatformSectorPackController, SectorPackAvailabilityController],
  providers: [SectorPackService],
  exports: [SectorPackService],
})
export class SectorPacksModule {}
