import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { CaseController } from './controllers/case.controller';
import { CaseAiController } from './controllers/case-ai.controller';
import { InternalCaseController } from './internal/internal-case.controller';
import { CaseService } from './services/case.service';
import { CaseAiService } from './services/case-ai.service';
import { CaseRepository } from './repositories/case.repository';
import { CaseStateMachineService } from './state-machine/case-state-machine.service';
import { CaseTimelineService } from './timeline/case-timeline.service';
import { CaseNoteService } from './notes/case-note.service';
import { HypothesisService } from './hypotheses/hypothesis.service';
import { CaseDecisionService } from './decisions/case-decision.service';
import { OutboxService } from '../../outbox/outbox.service';
import { ShieldAiClient } from '../../internal-client/shield-ai.client';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule],
  controllers: [CaseController, CaseAiController, InternalCaseController],
  providers: [
    CaseService,
    CaseAiService,
    CaseRepository,
    CaseStateMachineService,
    CaseTimelineService,
    CaseNoteService,
    HypothesisService,
    CaseDecisionService,
    OutboxService,
    ShieldAiClient,
  ],
  exports: [CaseService, CaseTimelineService],
})
export class CaseManagementModule {}
