import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import {
  InternalManagedDefenseController,
  ManagedDefenseController,
  PlatformManagedDefenseController,
} from './managed-defense.controller';
import { ManagedDefenseService } from './managed-defense.service';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [
    ManagedDefenseController,
    PlatformManagedDefenseController,
    InternalManagedDefenseController,
  ],
  providers: [ManagedDefenseService],
  exports: [ManagedDefenseService],
})
export class ManagedDefenseModule {}
