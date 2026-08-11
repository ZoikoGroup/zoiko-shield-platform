import { Module } from '@nestjs/common';
import { IncidentWorkOrderController } from './incident-work-order.controller';
import { IncidentWorkOrderService } from './incident-work-order.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [IncidentWorkOrderController],
  providers: [IncidentWorkOrderService],
  exports: [IncidentWorkOrderService],
})
export class IrWorkOrdersModule {}
