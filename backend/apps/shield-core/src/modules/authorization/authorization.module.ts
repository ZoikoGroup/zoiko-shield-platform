import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { AuthorizationService } from './authorization.service';
import { AuthorizationController } from './authorization.controller';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, TenantMembership])],
  controllers: [AuthorizationController],
  providers: [AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthorizationModule {}
