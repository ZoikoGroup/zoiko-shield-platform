import { Body, Controller, Get, Headers, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsPositive, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CreatePaymentDto, PaymentService, ProviderWebhookDto } from './payment.service';

export class RefundPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  reason!: string;
}

/** Authenticated, tenant-principal-initiated payment operations. */
@UseGuards(JwtAuthGuard)
@Controller('api/v1/payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  async create(@Body() dto: CreatePaymentDto, @Headers('idempotency-key') idempotencyKey: string) {
    if (!idempotencyKey) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Idempotency-Key header is required for payment creation',
      };
    }
    const payment = await this.paymentService.createPayment(dto, idempotencyKey);
    return { statusCode: HttpStatus.CREATED, data: payment };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const payment = await this.paymentService.getPaymentById(id);
    return { statusCode: HttpStatus.OK, data: payment };
  }

  @Patch(':id/refund')
  async refund(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    const refund = await this.paymentService.refundPayment(id, dto.amount, dto.reason);
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
