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
  async get(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    const payment = await this.paymentService.getPaymentByIdForTenant(
      tenantId,
      id,
    );
    return { statusCode: HttpStatus.OK, data: payment };
  }

  @Patch(':id/refund')
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
@Controller('api/v1/payments')
export class PaymentWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook')
  async webhook(@Body() dto: ProviderWebhookDto) {
    const payment = await this.paymentService.handleProviderWebhook(dto);
    return { statusCode: HttpStatus.OK, data: payment };
  }
}
