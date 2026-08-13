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

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, TenantMembership, Invitation])],
  controllers: [AuthorizationController],
  providers: [AuthorizationService, PermissionsGuard, PlatformPermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard, PlatformPermissionsGuard],
})
export class AuthorizationModule {}
