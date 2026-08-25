import { Module } from '@nestjs/common';
import { ServiceObligationController } from './service-obligation.controller';
import { ServiceObligationService } from './service-obligation.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ManagedDefenseModule } from '../managed-defense/managed-defense.module';

@Module({
  imports: [PrismaModule, ManagedDefenseModule],
  controllers: [ServiceObligationController],
  providers: [ServiceObligationService],
  exports: [ServiceObligationService],
})
export class ObligationsModule {}
