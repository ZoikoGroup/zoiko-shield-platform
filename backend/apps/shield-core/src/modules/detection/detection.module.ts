import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertModule } from '../alert/alert.module';
import { SecurityContextModule } from '../security-context/security-context.module';
import { DetectionController } from './detection.controller';
import { DetectionRegistryService } from './registry/detection-registry.service';
import { DetectionRuntimeService } from './runtime/detection-runtime.service';
import { DetectionReplayService } from './replay/detection-replay.service';
import { SuspiciousLoginRule } from './rules/suspicious-login/suspicious-login.rule';
import { SuspiciousProcessRule } from './rules/suspicious-process/suspicious-process.rule';
import { CloudPrivilegeEscalationRule } from './rules/cloud-privilege-escalation/cloud-privilege-escalation.rule';
import { NormalizedEventConsumer } from './consumers/normalized-event.consumer';
import { CompositeCorrelationService } from './correlation/composite-correlation.service';

@Module({
  imports: [PrismaModule, AlertModule, SecurityContextModule],
  controllers: [DetectionController],
  providers: [
    SuspiciousLoginRule,
    SuspiciousProcessRule,
    CloudPrivilegeEscalationRule,
    DetectionRegistryService,
    DetectionRuntimeService,
    DetectionReplayService,
    CompositeCorrelationService,
    NormalizedEventConsumer,
  ],
  exports: [
    DetectionRuntimeService,
    DetectionRegistryService,
    DetectionReplayService,
    CompositeCorrelationService,
  ],
})
export class DetectionModule {}
