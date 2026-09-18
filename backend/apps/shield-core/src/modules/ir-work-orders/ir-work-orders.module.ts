import { Module } from '@nestjs/common';
import {
  IncidentLegalSensitiveController,
  IncidentResponseRetainerController,
  IncidentWorkOrderController,
} from './incident-work-order.controller';
import { IncidentWorkOrderService } from './incident-work-order.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CommercialModule } from '../commercial/commercial.module';
import { IncidentResponseRetainerService } from './incident-response-retainer.service';

@Module({
  imports: [PrismaModule, ApprovalsModule, CommercialModule],
  controllers: [
    IncidentResponseRetainerController,
    IncidentWorkOrderController,
    IncidentLegalSensitiveController,
  ],
  providers: [IncidentResponseRetainerService, IncidentWorkOrderService],
  exports: [IncidentResponseRetainerService, IncidentWorkOrderService],
})
export class IrWorkOrdersModule {}
