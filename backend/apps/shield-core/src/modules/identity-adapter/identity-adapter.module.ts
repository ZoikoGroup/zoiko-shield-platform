import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrincipalService } from './principal.service';
import { SessionService } from './session.service';
import { VerificationChallengeService } from './verification-challenge.service';
import { WebauthnService } from './webauthn.service';
import { RecoveryGrantService } from './recovery-grant.service';
import { PolicyService } from './policy.service';
import { IdentityEventService } from './identity-event.service';
import { MailService } from './mail.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
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
import { ZoikoIdProviderBootstrapService } from './zoikoid-provider-bootstrap.service';
import { OwnerFederatedActivationService } from './owner-federated-activation.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    EvidenceModule,
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
    WebauthnService,
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
    ZoikoIdProviderBootstrapService,
    OwnerFederatedActivationService,
  ],
  exports: [
    PrincipalService,
    IdentityEventService,
    PolicyService,
    SessionService,
    MailService,
    WebauthnService,
    FederationAuthService,
    ZoikoIdProviderBootstrapService,
  ],
})
export class IdentityAdapterModule {}
