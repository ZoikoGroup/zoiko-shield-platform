import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseManagementModule } from '../case-management/case-management.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { ShieldAiClient } from '../../internal-client/shield-ai.client';
import { ShieldActionClient } from '../../internal-client/shield-action.client';
import { ShieldAnchorClient } from '../../internal-client/shield-anchor.client';
import { EmailSecurityService } from './email-security.service';
import { EmailSecurityController } from './email-security.controller';
import { EmailSecurityInternalController } from './email-security-internal.controller';
import { EmailCredentialVaultService } from './email-credential-vault.service';
import { EmailOAuthService } from './email-oauth.service';

@Module({
  imports: [
    PrismaModule,
    CaseManagementModule,
    AuthorizationModule,
    AuthorizationDecisionModule,
  ],
  controllers: [EmailSecurityController, EmailSecurityInternalController],
  providers: [
    EmailSecurityService,
    EmailCredentialVaultService,
    EmailOAuthService,
    ShieldIngestClient,
    ShieldAiClient,
    ShieldActionClient,
    ShieldAnchorClient,
  ],
  exports: [EmailSecurityService],
})
export class EmailSecurityModule {}
