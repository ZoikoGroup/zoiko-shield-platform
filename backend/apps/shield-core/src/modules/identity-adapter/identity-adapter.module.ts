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
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';

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
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
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
    GoogleStrategy,
    MicrosoftStrategy,
  ],
  exports: [PrincipalService, IdentityEventService, PolicyService],
})
export class IdentityAdapterModule {}
