import { Module } from '@nestjs/common';
import { CommercialKillSwitchController } from './commercial-kill-switch.controller';
import { CommercialKillSwitchService } from './commercial-kill-switch.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommercialKillSwitchController],
  providers: [CommercialKillSwitchService],
  exports: [CommercialKillSwitchService],
})
export class KillSwitchModule {}
