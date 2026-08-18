import { Module } from '@nestjs/common';
import {
  DunningPolicyController,
  DunningCaseController,
} from './dunning.controller';
import { DunningPolicyService } from './dunning-policy.service';
import { DunningService } from './dunning.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommerceModule } from '../commerce/commerce.module';

@Module({
  imports: [PrismaModule, CommerceModule],
  controllers: [DunningPolicyController, DunningCaseController],
  providers: [DunningPolicyService, DunningService],
  exports: [DunningPolicyService, DunningService],
})
export class DunningModule {}
