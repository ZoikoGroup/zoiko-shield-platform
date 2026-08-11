import { Module } from '@nestjs/common';
import { SectorPackController } from './sector-pack.controller';
import { SectorPackService } from './sector-pack.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SectorPackController],
  providers: [SectorPackService],
  exports: [SectorPackService],
})
export class SectorPacksModule {}
