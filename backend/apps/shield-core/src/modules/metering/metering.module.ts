import { Module } from '@nestjs/common';
import { MeterDefinitionController, MeteringController } from './metering.controller';
import { MeterDefinitionService } from './meter-definition.service';
import { MeteringService } from './metering.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MeterDefinitionController, MeteringController],
  providers: [MeterDefinitionService, MeteringService],
  exports: [MeterDefinitionService, MeteringService],
})
export class MeteringModule {}
