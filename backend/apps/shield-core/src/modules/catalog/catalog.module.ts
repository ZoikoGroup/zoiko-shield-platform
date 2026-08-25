import { Module } from '@nestjs/common';
import {
  CatalogAdminController,
  CatalogReadController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { EvaluationProgramController } from './evaluation-program.controller';
import { EvaluationProgramService } from './evaluation-program.service';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [
    CatalogAdminController,
    CatalogReadController,
    EvaluationProgramController,
  ],
  providers: [CatalogService, EvaluationProgramService],
  exports: [CatalogService, EvaluationProgramService],
})
export class CatalogModule {}
