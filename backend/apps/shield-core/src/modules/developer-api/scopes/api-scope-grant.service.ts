import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { isKnownScope } from './api-scope-registry';

/** No permanent hidden scope elevation — every grant is authorized and recorded (spec §34). */
@Injectable()
export class ApiScopeGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async grant(params: { tenantId: string; apiClientId: string; scope: string; environmentId?: string; grantedBy: string; expiresAt?: Date }) {
    if (!isKnownScope(params.scope)) {
      throw new BadRequestException(`Unknown scope '${params.scope}'`);
    }

    const { authorizationDecisionId, decision } = await this.authorizationDecisionService.evaluate({
      actorId: params.grantedBy,
      tenantId: params.tenantId,
      action: 'api_scope:grant',
      resourceType: 'ApiClient',
      resourceId: params.apiClientId,
    });
    if (decision === 'DENY') {
      throw new ForbiddenException('Actor is not authorized to grant API scopes');
    }

    return this.prisma.apiScopeGrant.create({
      data: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        api_client_id: params.apiClientId,
        scope: params.scope,
        environment_id: params.environmentId,
        granted_by: params.grantedBy,
        authorization_decision_id: authorizationDecisionId,
        expires_at: params.expiresAt,
      },
    });
  }

  async getActiveScopes(tenantId: string, apiClientId: string): Promise<string[]> {
    const grants = await this.prisma.apiScopeGrant.findMany({
      where: { tenant_id: tenantId, api_client_id: apiClientId, revoked_at: null, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
    });
    return grants.map((g) => g.scope);
  }

  async revoke(tenantId: string, scopeGrantId: string) {
    return this.prisma.apiScopeGrant.update({ where: { id: scopeGrantId }, data: { revoked_at: new Date() } });
  }
}
