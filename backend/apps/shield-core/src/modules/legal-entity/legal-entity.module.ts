import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalEntityService } from './legal-entity.service';
import { DataSovereigntyGuardService } from './data-sovereignty-guard.service';
import { LegalEntityController } from './legal-entity.controller';
import { LegalEntity } from './legal-entity.entity';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([LegalEntity]), AuthorizationModule],
  controllers: [LegalEntityController],
  providers: [LegalEntityService, DataSovereigntyGuardService],
  exports: [LegalEntityService, DataSovereigntyGuardService],
})
export class LegalEntityModule {}
