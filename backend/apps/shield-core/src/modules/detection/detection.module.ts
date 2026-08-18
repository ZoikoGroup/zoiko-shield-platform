import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertModule } from '../alert/alert.module';
import { SecurityContextModule } from '../security-context/security-context.module';
import { DetectionController } from './detection.controller';
import { DetectionRegistryService } from './registry/detection-registry.service';
import { DetectionRuntimeService } from './runtime/detection-runtime.service';
import { DetectionReplayService } from './replay/detection-replay.service';
import { SuspiciousLoginRule } from './rules/suspicious-login/suspicious-login.rule';
import { NormalizedEventConsumer } from './consumers/normalized-event.consumer';

@Module({
  imports: [PrismaModule, AlertModule, SecurityContextModule],
  controllers: [DetectionController],
  providers: [
    SuspiciousLoginRule,
    DetectionRegistryService,
    DetectionRuntimeService,
    DetectionReplayService,
    NormalizedEventConsumer,
  ],
  exports: [
    DetectionRuntimeService,
    DetectionRegistryService,
    DetectionReplayService,
  ],
})
export class DetectionModule {}
