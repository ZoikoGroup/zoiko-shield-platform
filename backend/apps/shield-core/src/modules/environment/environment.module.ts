import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentService } from './environment.service';
import { EnvironmentController } from './environment.controller';
import { Environment } from './environment.entity';
import { TenantModule } from '../tenant/tenant.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Environment]), TenantModule, AuthorizationModule],
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
  exports: [EnvironmentService],
})
export class EnvironmentModule {}
