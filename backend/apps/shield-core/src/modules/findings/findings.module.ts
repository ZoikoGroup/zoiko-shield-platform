import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FindingsController } from './findings.controller';
import { FindingService } from './finding.service';

@Module({
  imports: [PrismaModule],
  controllers: [FindingsController],
  providers: [FindingService],
  exports: [FindingService],
})
export class FindingsModule {}
