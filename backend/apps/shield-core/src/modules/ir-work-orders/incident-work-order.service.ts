import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { assertTransition } from '../commerce/state-machine.util';

const WORK_ORDER_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['CLOSED', 'BLOCKED_OVERAGE'],
  BLOCKED_OVERAGE: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export class ActivateWorkOrderDto {
  @IsUUID()
  contractId!: string;

  @IsString()
  incidentReference!: string;

  @IsString()
  activationReason!: string;

  @IsOptional()
  @IsIn(['R0', 'R1', 'R2', 'R3', 'R4'])
  responseAuthority?: string;

  @IsString()
  authorizedBy!: string;

  @IsOptional()
  @IsNumber()
  includedHours?: number;

  @IsOptional()
  @IsIn(['BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED'])
  overagePolicy?: string;

  @IsOptional()
  @IsNumber()
  overageCapHours?: number;

  @IsOptional()
  @IsString()
  customerContact?: string;
}

export class LogHoursDto {
  @IsNumber()
  @IsPositive()
  hours!: number;

  @IsOptional()
  @IsString()
  actor?: string;
}

/**
 * ZS-COM-BILL-001 Part 15: never generates a surprise IR charge during an
 * active incident. Consumption is tracked continuously against
 * included_hours; anything past that is either capped, blocked, or gated
 * on an approved OVERAGE_OVERRIDE commercial approval — never silently
 * billed.
 */
@Injectable()
export class IncidentWorkOrderService {
  private readonly logger = new Logger(IncidentWorkOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  async activate(dto: ActivateWorkOrderDto) {
    const activeIrObligation = await this.prisma.serviceObligation.findFirst({
      where: { contract_id: dto.contractId, obligation_type: 'IR_RETAINER', status: 'ACTIVE' },
    });
    if (!activeIrObligation) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_ACTIVE_IR_RETAINER',
        message: `Contract '${dto.contractId}' has no ACTIVE IR_RETAINER service obligation`,
      });
    }

    return this.prisma.incidentWorkOrder.create({
      data: {
        contract_id: dto.contractId,
        incident_reference: dto.incidentReference,
        activation_reason: dto.activationReason,
        response_authority: dto.responseAuthority || 'R1',
        authorized_by: dto.authorizedBy,
        included_hours: dto.includedHours ?? 0,
        overage_policy: dto.overagePolicy || 'REQUIRE_APPROVAL',
        overage_cap_hours: dto.overageCapHours,
        customer_contact: dto.customerContact,
        status: 'ACTIVE',
      },
    });
  }

  async getWorkOrderById(id: string) {
    const workOrder = await this.prisma.incidentWorkOrder.findUnique({ where: { id } });
    if (!workOrder) {
      throw new NotFoundException(`Incident work order '${id}' not found`);
    }
    return workOrder;
  }

  /**
   * Logs consumed hours. If the new total exceeds included_hours:
   * - BLOCK: rejected outright, nothing logged.
   * - ALLOW_CAPPED: allowed up to overage_cap_hours beyond included_hours, then blocked.
   * - REQUIRE_APPROVAL: rejected unless an APPROVED OVERAGE_OVERRIDE approval already exists for this work order.
   */
  async logHours(workOrderId: string, dto: LogHoursDto) {
    const workOrder = await this.getWorkOrderById(workOrderId);
    if (workOrder.status !== 'ACTIVE') {
      throw new ConflictException(`Work order '${workOrderId}' is '${workOrder.status}', not ACTIVE`);
    }

    const included = Number(workOrder.included_hours);
    const consumed = Number(workOrder.consumed_hours);
    const newTotal = consumed + dto.hours;

    if (newTotal > included) {
      const overageHours = newTotal - included;

      if (workOrder.overage_policy === 'BLOCK') {
        throw new ConflictException({
          statusCode: 409,
          error: 'OVERAGE_BLOCKED',
          message: `Logging ${dto.hours}h would exceed the ${included}h included in work order '${workOrderId}'; overage policy is BLOCK`,
        });
      }

      if (workOrder.overage_policy === 'ALLOW_CAPPED') {
        const cap = Number(workOrder.overage_cap_hours ?? 0);
        if (overageHours > cap) {
          throw new ConflictException({
            statusCode: 409,
            error: 'OVERAGE_CAP_EXCEEDED',
            message: `Overage of ${overageHours}h exceeds the pre-authorized cap of ${cap}h`,
          });
        }
      }

      if (workOrder.overage_policy === 'REQUIRE_APPROVAL') {
        const approval = await this.prisma.commercialApproval.findFirst({
          where: {
            object_type: 'IncidentWorkOrder',
            object_id: workOrderId,
            change_type: 'OVERAGE_OVERRIDE',
            status: 'APPROVED',
          },
          orderBy: { requested_at: 'desc' },
        });
        if (!approval) {
          throw new ConflictException({
            statusCode: 409,
            error: 'OVERAGE_REQUIRES_APPROVAL',
            message: `Logging ${dto.hours}h would exceed included hours; an approved OVERAGE_OVERRIDE commercial approval is required first`,
          });
        }
      }
    }

    return this.prisma.incidentWorkOrder.update({
      where: { id: workOrderId },
      data: { consumed_hours: newTotal },
    });
  }

  async requestOverageApproval(workOrderId: string, requestedBy: string, reason: string) {
    await this.getWorkOrderById(workOrderId);
    return this.approvalService.requestApproval({
      changeType: 'OVERAGE_OVERRIDE',
      objectType: 'IncidentWorkOrder',
      objectId: workOrderId,
      requestedBy,
      reason,
    });
  }

  async close(workOrderId: string) {
    const workOrder = await this.getWorkOrderById(workOrderId);
    assertTransition(WORK_ORDER_TRANSITIONS, workOrder.status, 'CLOSED', 'incident work order');
    return this.prisma.incidentWorkOrder.update({
      where: { id: workOrderId },
      data: { status: 'CLOSED', closed_at: new Date() },
    });
  }
}
