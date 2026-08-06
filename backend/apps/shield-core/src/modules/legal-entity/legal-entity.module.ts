import { Module } from '@nestjs/common';
import { LegalEntityService } from './legal-entity.service';
import { LegalEntityController } from './legal-entity.controller';

@Module({
  controllers: [LegalEntityController],
  providers: [LegalEntityService],
  exports: [LegalEntityService],
})
export class LegalEntityModule {}