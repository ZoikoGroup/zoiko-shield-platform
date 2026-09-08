import { Module } from '@nestjs/common';
import { CommandCenterBffService } from './command-center-bff.service';
import { CommandCenterBffController } from './command-center-bff.controller';

@Module({
  controllers: [CommandCenterBffController],
  providers: [CommandCenterBffService],
  exports: [CommandCenterBffService],
})
export class ExperienceModule {}
