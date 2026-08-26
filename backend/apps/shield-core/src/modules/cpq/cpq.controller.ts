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
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CreateQuoteDto, QuoteService } from './quote.service';
import { CreateOrderDto, OrderService } from './order.service';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  requireEnvironmentId,
  requireRegion,
  requireTenantId,
} from '../../tenant-context';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import {
  OfferReadinessService,
  VerifyCpqOfferReadinessDto,
} from './offer-readiness.service';

export class ApproveQuoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}
export class RejectQuoteDto {
  @IsString()
  reason!: string;
}

export class ProvisionOrderDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  termMonths?: number;
}

function boundary(
  headerTenantId: string,
  headerEnvironmentId: string,
  user: AuthenticatedUser,
) {
  return {
    tenantId: requireTenantId(headerTenantId, user.tenantId),
    environmentId: requireEnvironmentId(
      headerEnvironmentId,
      user.environmentId,
    ),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/cpq/quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @Headers('x-region') headerRegion: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuoteDto,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.createQuote(
      {
        ...scope,
        region: requireRegion(headerRegion, user.region),
        actorId: user.id,
      },
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: quote };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.getQuoteById(
      id,
      scope.tenantId,
      scope.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/submit')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  async submit(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.submitForApproval(
      id,
      scope.tenantId,
      scope.environmentId,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/approve')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async approve(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() _dto: ApproveQuoteDto,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.approveQuote(
      id,
      scope.tenantId,
      scope.environmentId,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/reject')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async reject(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.rejectQuote(
      id,
      scope.tenantId,
      scope.environmentId,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  async cancel(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const quote = await this.quoteService.cancelQuote(
      id,
      scope.tenantId,
      scope.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: quote };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/cpq/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const order = await this.orderService.createOrderFromQuote(
      { ...scope, actorId: user.id },
      dto,
      idempotencyKey,
    );
    return { statusCode: HttpStatus.CREATED, data: order };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const order = await this.orderService.getOrderById(
      id,
      scope.tenantId,
      scope.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: order };
  }

  @Patch(':id/provision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async provision(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProvisionOrderDto,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const result = await this.orderService.provisionOrder(
      { ...scope, actorId: user.id },
      id,
      dto.termMonths,
    );
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Patch(':id/reject')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async reject(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, headerEnvironmentId, user);
    const order = await this.orderService.rejectOrder(
      id,
      scope.tenantId,
      scope.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: order };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(
  PERMISSION_CODES.PLATFORM_COMMERCIAL_READINESS_VERIFY,
)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/cpq/offer-readiness')
export class PlatformOfferReadinessController {
  constructor(private readonly readiness: OfferReadinessService) {}

  @Post('verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyCpqOfferReadinessDto,
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.readiness.verify(dto, user.id),
    };
  }

  @Get('products/:productId')
  async list(
    @Param('productId') productId: string,
    @Query('region') region?: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.readiness.list(productId, region),
    };
  }
}
