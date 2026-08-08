import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalEntityService } from './legal-entity.service';
import { LegalEntityController } from './legal-entity.controller';
import { LegalEntity } from './legal-entity.entity';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([LegalEntity]), AuthorizationModule],
  controllers: [LegalEntityController],
  providers: [LegalEntityService],
  exports: [LegalEntityService],
})
export class LegalEntityModule {}
