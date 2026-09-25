import { Module } from '@nestjs/common';
import { LegalEntityService } from './legal-entity.service';
import { DataSovereigntyGuardService } from './data-sovereignty-guard.service';
import { LegalEntityController } from './legal-entity.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [LegalEntityController],
  providers: [LegalEntityService, DataSovereigntyGuardService],
  exports: [LegalEntityService, DataSovereigntyGuardService],
})
export class LegalEntityModule {}
