import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateIncidentResponseRetainerDto,
  DecideIncidentResponseRetainerDto,
  IncidentResponseRetainerService,
} from './incident-response-retainer.service';
import {
  ActivateWorkOrderDto,
  CloseIncidentWorkOrderDto,
  CreateIncidentLegalRecordDto,
  DecideEmergencyReconciliationDto,
  DecideThirdPartyCostDto,
  IncidentWorkOrderService,
  LogHoursDto,
  RequestEmergencyReconciliationDto,
  RequestIncidentOverageApprovalDto,
  RequestThirdPartyCostDto,
} from './incident-work-order.service';

function boundary(headerTenantId: string, user: AuthenticatedUser) {
  return {
    tenantId: requireTenantId(headerTenantId),
    environmentId: requireEnvironmentId(user.environmentId),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/ir/retainers')
export class IncidentResponseRetainerController {
  constructor(private readonly retainers: IncidentResponseRetainerService) {}

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.retainers.list(scope.tenantId, scope.environmentId),
    };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.retainers.get(id, scope.tenantId, scope.environmentId),
    };
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentResponseRetainerDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.retainers.create(
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decide(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideIncidentResponseRetainerDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.retainers.decide(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/ir/work-orders')
export class IncidentWorkOrderController {
  constructor(private readonly workOrders: IncidentWorkOrderService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async activate(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ActivateWorkOrderDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.workOrders.activate(
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.getWorkOrderById(
        id,
        scope.tenantId,
        scope.environmentId,
      ),
    };
  }

  @Get(':id/consumption')
  async consumption(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.listConsumption(
        id,
        scope.tenantId,
        scope.environmentId,
      ),
    };
  }

  @Post(':id/hours')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async logHours(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LogHoursDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.logHours(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/overage-approval')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestOverageApproval(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestIncidentOverageApprovalDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.workOrders.requestOverageApproval(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/emergency-reconciliation')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestEmergencyReconciliation(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestEmergencyReconciliationDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.workOrders.requestEmergencyReconciliation(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/emergency-reconciliation/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideEmergencyReconciliation(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideEmergencyReconciliationDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.decideEmergencyReconciliation(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/third-party-costs')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestThirdPartyCost(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestThirdPartyCostDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.workOrders.requestThirdPartyCost(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/third-party-costs/:costId/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideThirdPartyCost(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('costId') costId: string,
    @Body() dto: DecideThirdPartyCostDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.decideThirdPartyCost(
        id,
        costId,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/close')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async close(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseIncidentWorkOrderDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.close(
        id,
        scope.tenantId,
        scope.environmentId,
        dto,
      ),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_IR_LEGAL_SENSITIVE_READ)
@Controller('api/v1/ir/legal-sensitive-records')
export class IncidentLegalSensitiveController {
  constructor(private readonly workOrders: IncidentWorkOrderService) {}

  @Get('work-orders/:workOrderId')
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('workOrderId') workOrderId: string,
    @Query('accessReason') accessReason: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.workOrders.listLegalSensitiveRecords(
        workOrderId,
        scope.tenantId,
        scope.environmentId,
        user.id,
        accessReason,
      ),
    };
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_IR_LEGAL_SENSITIVE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentLegalRecordDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.workOrders.createLegalSensitiveRecord(
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }
}
