import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractStateService } from './contract-state.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContractController],
  providers: [ContractStateService],
  exports: [ContractStateService],
})
export class CommerceModule {}
