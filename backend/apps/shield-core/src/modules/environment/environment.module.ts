import { forwardRef, Module } from '@nestjs/common';
import { EnvironmentService } from './environment.service';
import { EnvironmentController } from './environment.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => TenantModule),
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
  exports: [EnvironmentService],
})
export class EnvironmentModule {}
