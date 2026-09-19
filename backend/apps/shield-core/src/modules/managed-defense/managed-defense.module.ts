import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CommercialModule } from '../commercial/commercial.module';
import {
  InternalManagedDefenseController,
  ManagedDefenseController,
  PlatformManagedDefenseController,
} from './managed-defense.controller';
import { ManagedDefenseService } from './managed-defense.service';
import { MdrServiceObligationService } from './mdr-service-obligation.service';
import { MdrServiceObligationController } from './mdr-service-obligation.controller';

@Module({
  imports: [PrismaModule, ApprovalsModule, CommercialModule],
  controllers: [
    ManagedDefenseController,
    PlatformManagedDefenseController,
    InternalManagedDefenseController,
    MdrServiceObligationController,
  ],
  providers: [ManagedDefenseService, MdrServiceObligationService],
  exports: [ManagedDefenseService, MdrServiceObligationService],
})
export class ManagedDefenseModule {}
