import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { Principal } from '../identity-adapter/principal.entity';
import { OutboxService } from '../../outbox/outbox.service';
import { DeveloperApiController, OauthController, PublicAlertsController } from './developer-api.controller';
import { ApiClientService } from './clients/api-client.service';
import { ApiClientCredentialService } from './credentials/api-client-credential.service';
import { ApiScopeGrantService } from './scopes/api-scope-grant.service';
import { OauthTokenService } from './oauth/oauth-token.service';
import { ApiClientAuthGuard } from './guards/api-client-auth.guard';

@Module({
  imports: [
    PrismaModule,
    AuthorizationDecisionModule,
    TypeOrmModule.forFeature([Principal]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [DeveloperApiController, OauthController, PublicAlertsController],
  providers: [OutboxService, ApiClientService, ApiClientCredentialService, ApiScopeGrantService, OauthTokenService, ApiClientAuthGuard],
  exports: [ApiClientService, ApiClientCredentialService, ApiScopeGrantService],
})
export class DeveloperApiModule {}
