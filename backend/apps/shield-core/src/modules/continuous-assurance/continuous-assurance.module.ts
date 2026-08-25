import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ContinuousAssuranceController } from './continuous-assurance.controller';
import { ContinuousAssuranceService } from './continuous-assurance.service';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [ContinuousAssuranceController],
  providers: [ContinuousAssuranceService],
  exports: [ContinuousAssuranceService],
})
export class ContinuousAssuranceModule {}
