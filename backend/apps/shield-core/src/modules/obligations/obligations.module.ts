import { Module } from '@nestjs/common';
import { ServiceObligationController } from './service-obligation.controller';
import { ServiceObligationService } from './service-obligation.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceObligationController],
  providers: [ServiceObligationService],
  exports: [ServiceObligationService],
})
export class ObligationsModule {}
