import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { Invitation } from './entities/invitation.entity';
import { JitElevationRequest } from './entities/jit-elevation-request.entity';
import { AuthorizationService } from './authorization.service';
import { JitElevationService } from './jit-elevation.service';
import { AuthorizationController } from './authorization.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { Session } from '../identity-adapter/session.entity';
import { IdentityEvent } from '../identity-adapter/identity-event.entity';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationDecisionService } from '../authorization-decision/authorization-decision.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    TypeOrmModule.forFeature([
      Permission,
      Role,
      TenantMembership,
      Invitation,
      JitElevationRequest,
      Session,
      IdentityEvent,
    ]),
  ],
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    JitElevationService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
  exports: [
    AuthorizationService,
    JitElevationService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
})
export class AuthorizationModule {}
