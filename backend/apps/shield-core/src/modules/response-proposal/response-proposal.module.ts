import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { CaseManagementModule } from '../case-management/case-management.module';
import { ResponseProposalController } from './controllers/response-proposal.controller';
import { ActionAuthorizationController } from './internal/action-authorization.controller';
import { ResponseProposalService } from './services/response-proposal.service';
import { ActionSimulatedConsumer } from './consumers/action-simulated.consumer';
import { OutboxService } from '../../outbox/outbox.service';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule, CaseManagementModule],
  controllers: [ResponseProposalController, ActionAuthorizationController],
  providers: [ResponseProposalService, ActionSimulatedConsumer, OutboxService],
  exports: [ResponseProposalService],
})
export class ResponseProposalModule {}
