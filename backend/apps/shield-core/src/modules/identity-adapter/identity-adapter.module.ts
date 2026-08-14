import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Principal } from './principal.entity';
import { LocalCredential } from './local-credential.entity';
import { ExternalIdentity } from './external-identity.entity';
import { Session } from './session.entity';
import { VerificationChallenge } from './verification-challenge.entity';
import { RecoveryGrant } from './recovery-grant.entity';
import { PolicyDocument } from './policy-document.entity';
import { PolicyAcceptance } from './policy-acceptance.entity';
import { IdentityEvent } from './identity-event.entity';
import { PrincipalService } from './principal.service';
import { SessionService } from './session.service';
import { VerificationChallengeService } from './verification-challenge.service';
import { RecoveryGrantService } from './recovery-grant.service';
import { PolicyService } from './policy.service';
import { IdentityEventService } from './identity-event.service';
import { MailService } from './mail.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { IdentityProviderConfiguration } from './identity-provider-configuration.entity';
import { FederationTransaction } from './federation-transaction.entity';
import { SamlRequestCacheEntry } from './saml-request-cache.entity';
import { ExternalIdentityTenantBinding } from './external-identity-tenant-binding.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { Invitation } from '../authorization/entities/invitation.entity';
import { Role } from '../authorization/entities/role.entity';
import { Tenant } from '../tenant/tenant.entity';
import { Environment } from '../environment/environment.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationTransactionService } from './federation-transaction.service';
import { DatabaseSamlCacheProvider } from './database-saml-cache.provider';
import { OidcFederationService } from './oidc-federation.service';
import { SamlFederationService } from './saml-federation.service';
import { SessionContextService } from './session-context.service';
import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';
import { FederationAuthService } from './federation-auth.service';
import { FederationController } from './federation.controller';
import { IdentityProviderConfigurationController } from './identity-provider-configuration.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Principal,
      LocalCredential,
      ExternalIdentity,
      Session,
      VerificationChallenge,
      RecoveryGrant,
      PolicyDocument,
      PolicyAcceptance,
      IdentityEvent,
      IdentityProviderConfiguration,
      FederationTransaction,
      SamlRequestCacheEntry,
      ExternalIdentityTenantBinding,
      TenantMembership,
      Invitation,
      Role,
      Tenant,
      Environment,
    ]),
    AuthorizationModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '15m',
          ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
          issuer: config.get<string>('JWT_ISSUER', 'zoikoshield'),
          audience: config.get<string>('JWT_AUDIENCE', 'zoikoshield-api'),
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    FederationController,
    IdentityProviderConfigurationController,
  ],
  providers: [
    PrincipalService,
    SessionService,
    VerificationChallengeService,
    RecoveryGrantService,
    PolicyService,
    IdentityEventService,
    MailService,
    AuthService,
    JwtStrategy,
    FederationRuntimeService,
    FederationTransactionService,
    DatabaseSamlCacheProvider,
    OidcFederationService,
    SamlFederationService,
    SessionContextService,
    IdentityProviderConfigurationService,
    FederationAuthService,
  ],
  exports: [
    PrincipalService,
    IdentityEventService,
    PolicyService,
    SessionService,
  ],
})
export class IdentityAdapterModule {}
