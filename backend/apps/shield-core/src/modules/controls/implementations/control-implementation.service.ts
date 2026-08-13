import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { ControlImplementationStateMachineService } from './control-implementation-state-machine.service';

export interface CreateControlImplementationInput {
  tenantId: string;
  environmentId?: string;
  controlObjectiveId: string;
  title: string;
  description: string;
  ownerId: string;
  implementationType: string;
  requestedBy: string;
}

/** ControlObjective = WHAT should exist; ControlImplementation = HOW this tenant actually implements it (spec §7). */
@Injectable()
export class ControlImplementationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly stateMachine: ControlImplementationStateMachineService,
  ) {}

  async create(input: CreateControlImplementationInput) {
    const { decision } = await this.authorizationDecisionService.evaluate({
      actorId: input.requestedBy,
      tenantId: input.tenantId,
      action: 'control_implementation:create',
      resourceType: 'ControlObjective',
      resourceId: input.controlObjectiveId,
    });
    if (decision === 'DENY') {
      throw new ForbiddenException(
        'Actor is not authorized to create control implementations',
      );
    }

    return this.prisma.controlImplementation.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        control_objective_id: input.controlObjectiveId,
        title: input.title,
        description: input.description,
        owner_id: input.ownerId,
        implementation_type: input.implementationType,
        status: 'PLANNED',
      },
    });
  }

  async transition(params: {
    tenantId: string;
    controlImplementationId: string;
    toStatus: string;
    actorId: string;
    notApplicableRationale?: string;
  }) {
    const impl = await this.assertTenantOwnership(
      params.tenantId,
      params.controlImplementationId,
    );
    this.stateMachine.assertValidTransition(impl.status, params.toStatus);

    if (params.toStatus === 'NOT_APPLICABLE') {
      if (!params.notApplicableRationale) {
        throw new BadRequestException('NOT_APPLICABLE requires a rationale');
      }
      const { decision } = await this.authorizationDecisionService.evaluate({
        actorId: params.actorId,
        tenantId: params.tenantId,
        action: 'control_implementation:mark_not_applicable',
        resourceType: 'ControlImplementation',
        resourceId: impl.id,
      });
      if (decision === 'DENY') {
        throw new ForbiddenException(
          'Actor is not authorized to mark this control NOT_APPLICABLE',
        );
      }
    }

    return this.prisma.controlImplementation.update({
      where: { id: impl.id },
      data: {
        status: params.toStatus,
        not_applicable_rationale:
          params.toStatus === 'NOT_APPLICABLE'
            ? params.notApplicableRationale
            : impl.not_applicable_rationale,
        reviewed_at: new Date(),
      },
    });
  }

  async assertTenantOwnership(
    tenantId: string,
    controlImplementationId: string,
  ) {
    const impl = await this.prisma.controlImplementation.findUnique({
      where: { id: controlImplementationId },
    });
    if (!impl) {
      throw new NotFoundException(
        `ControlImplementation '${controlImplementationId}' not found`,
      );
    }
    if (impl.tenant_id !== tenantId) {
      throw new ForbiddenException(
        `ControlImplementation '${controlImplementationId}' does not belong to this tenant`,
      );
    }
    return impl;
  }

  async list(tenantId: string) {
    return this.prisma.controlImplementation.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
  }
}
