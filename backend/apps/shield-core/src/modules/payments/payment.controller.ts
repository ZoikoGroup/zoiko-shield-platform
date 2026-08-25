import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsPositive, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  CreatePaymentDto,
  PaymentService,
  ProviderWebhookDto,
} from './payment.service';
import { ExternallyAuthenticatedEndpoint } from '../../security/endpoint-access.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';

export class RefundPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  reason!: string;
}

/** Authenticated, tenant-principal-initiated payment operations. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_PAYMENT_CREATE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for payment creation',
      );
    }
    const payment = await this.paymentService.createPayment(
      tenantId,
      dto,
      idempotencyKey,
    );
    return { statusCode: HttpStatus.CREATED, data: payment };
  }

  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
  async get(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    const payment = await this.paymentService.getPaymentByIdForTenant(
      tenantId,
      id,
    );
    return { statusCode: HttpStatus.OK, data: payment };
  }

  @Patch(':id/refund')
  @RequirePermissions(PERMISSION_CODES.TENANT_REFUND_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async refund(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    const refund = await this.paymentService.refundPaymentForTenant(
      tenantId,
      id,
      dto.amount,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: refund };
  }
}

/**
 * Provider-authenticated (signature-verified in PaymentService, not a user
 * JWT) — deliberately excluded from JwtAuthGuard, same reasoning a
 * payment processor webhook always needs: the caller is the processor,
 * not a logged-in ZoikoShield user.
 */
@ExternallyAuthenticatedEndpoint()
@Controller('api/v1/payments')
export class PaymentWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook')
  async webhook(@Body() dto: ProviderWebhookDto) {
    const payment = await this.paymentService.handleProviderWebhook(dto);
    return { statusCode: HttpStatus.OK, data: payment };
  }
}
