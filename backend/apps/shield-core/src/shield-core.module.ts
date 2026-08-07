import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { CustomerModule } from './modules/customer/customer.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LegalEntityModule } from './modules/legal-entity/legal-entity.module';
import { EnvironmentModule } from './modules/environment/environment.module';
import { IdentityAdapterModule } from './modules/identity-adapter/identity-adapter.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { User } from './modules/identity-adapter/user.entity';
import { Session } from './modules/identity-adapter/session.entity';
import { OtpCode } from './modules/identity-adapter/otp-code.entity';
import { Permission } from './modules/authorization/entities/permission.entity';
import { Role } from './modules/authorization/entities/role.entity';
import { TenantMembership } from './modules/authorization/entities/tenant-membership.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [User, Session, OtpCode, Permission, Role, TenantMembership],
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    }),
    TenantModule,
    CustomerModule,
    OrganizationModule,
    LegalEntityModule,
    EnvironmentModule,
    IdentityAdapterModule,
    AuthorizationModule,
  ],
  controllers: [ShieldCoreController],
  providers: [ShieldCoreService],
})
export class ShieldCoreModule {}
