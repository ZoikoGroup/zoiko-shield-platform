import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OutboxService } from '../../outbox/outbox.service';
import { RiskController } from './risk.controller';
import { ControlDeficiencyService } from './deficiencies/control-deficiency.service';
import { RiskService } from './risks/risk.service';
import { RiskTreatmentService } from './treatments/risk-treatment.service';
import { RiskAcceptanceService } from './acceptances/risk-acceptance.service';
import { ExceptionService } from './exceptions/exception.service';
import { ExceptionExpiryService } from './exceptions/exception-expiry.service';

@Module({
  imports: [PrismaModule],
  controllers: [RiskController],
  providers: [OutboxService, ControlDeficiencyService, RiskService, RiskTreatmentService, RiskAcceptanceService, ExceptionService, ExceptionExpiryService],
  exports: [ControlDeficiencyService, RiskService, RiskTreatmentService, RiskAcceptanceService, ExceptionService],
})
export class RiskModule {}
