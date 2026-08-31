import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  HUMAN_AUTHORITY_KEY,
  type HumanAuthorityRequirement,
} from './human-authority.decorator';
import type { HumanAuthorityAttestationDto } from './human-authority.dto';
import { HumanAuthorityService } from './human-authority.service';

@Injectable()
export class HumanAuthorityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authority: HumanAuthorityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<HumanAuthorityRequirement>(
        HUMAN_AUTHORITY_KEY,
        [context.getHandler(), context.getClass()],
      );
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      params?: Record<string, string | undefined>;
      body?: {
        humanAuthority?: HumanAuthorityAttestationDto;
        workOrderId?: string;
        runId?: string;
      };
      user?: AuthenticatedUser;
    }>();
    const user = request.user!;
    const attestation = request.body?.humanAuthority;
    const resourceId = requirement.resourceParam
      ? request.params?.[requirement.resourceParam]
      : (request.params?.id ??
        request.body?.workOrderId ??
        request.body?.runId ??
        request.params?.tenantId ??
        'UNSPECIFIED');
    await this.authority.authorize({
      // PermissionsGuard has already resolved the real target tenant. For a
      // PLATFORM_SCOPE actor this intentionally differs from the membership
      // scope carried by the session.
      tenantId: requireTenantId(request.headers['x-tenant-id']),
      environmentId: requirement.tenantScoped
        ? (request.headers['x-environment-id'] ??
          user?.environmentId ??
          'TENANT_CONTROL_PLANE')
        : requireEnvironmentId(
            request.headers['x-environment-id'],
            user?.environmentId,
          ),
      actionClass: requirement.actionClass,
      resourceType: requirement.resourceType,
      resourceId: resourceId ?? 'UNSPECIFIED',
      actorId: user.id,
      decisionOrigin: attestation?.decisionOrigin,
      humanConfirmation: attestation?.humanConfirmation,
      authorityStatement: attestation?.authorityStatement,
      aiOutputId: attestation?.aiOutputId,
      aiHumanReviewId: attestation?.aiHumanReviewId,
      authorizationContext: {
        assurance: user.assurance,
        sessionId: user.sessionId,
        policyVersion: user.policyVersion,
      },
    });
    return true;
  }
}
