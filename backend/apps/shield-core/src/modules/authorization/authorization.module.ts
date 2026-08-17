import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { Invitation } from './entities/invitation.entity';
import { AuthorizationService } from './authorization.service';
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
      Session,
      IdentityEvent,
    ]),
  ],
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
  exports: [
    AuthorizationService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
})
export class AuthorizationModule { }
