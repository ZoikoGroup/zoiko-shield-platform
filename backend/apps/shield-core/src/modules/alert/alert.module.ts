import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertController } from './controllers/alert.controller';
import { AlertService } from './services/alert.service';
import { AlertCreationService } from './services/alert-creation.service';
import { AlertRepository } from './repositories/alert.repository';
import { AlertSuppressionService } from './suppression/alert-suppression.service';
import { AlertAssignmentService } from './assignment/alert-assignment.service';
import { AlertStateMachineService } from './state-machine/alert-state-machine.service';
import { OutboxService } from '../../outbox/outbox.service';

@Module({
  imports: [PrismaModule],
  controllers: [AlertController],
  providers: [
    AlertService,
    AlertCreationService,
    AlertRepository,
    AlertSuppressionService,
    AlertAssignmentService,
    AlertStateMachineService,
    OutboxService,
  ],
  exports: [AlertCreationService, AlertSuppressionService],
})
export class AlertModule {}
