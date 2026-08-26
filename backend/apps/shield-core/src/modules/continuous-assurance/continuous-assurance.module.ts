import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ContinuousAssuranceController } from './continuous-assurance.controller';
import { ContinuousAssuranceService } from './continuous-assurance.service';
import { EvidenceDecayWorker } from './evidence-decay.worker';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [ContinuousAssuranceController],
  providers: [ContinuousAssuranceService, EvidenceDecayWorker],
  exports: [ContinuousAssuranceService, EvidenceDecayWorker],
})
export class ContinuousAssuranceModule {}
