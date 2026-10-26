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
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsDefined,
  IsNumber,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  CreatePaymentDto,
  PaymentService,
  ProviderWebhookDto,
} from './payment.service';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';
import {
  ExternallyAuthenticatedEndpoint,
  PublicEndpoint,
} from '../../security/endpoint-access.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { HumanAuthorityAttestationDto } from '../human-authority/human-authority.dto';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';

export class RefundPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  reason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
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
  @UseGuards(HumanAuthorityGuard)
  @RequireHumanAuthority('REFUND_AUTHORIZATION', 'Payment', 'id')
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
 * Public checkout endpoints allowing users (guests or authenticated members)
 * to initiate Stripe Checkout sessions and query authoritative checkout session status.
 */
@PublicEndpoint()
@Controller('api/v1/payments')
export class PaymentCheckoutController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout-session')
  async createCheckoutSession(
    @Body() dto: CreateCheckoutSessionDto,
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Req() req?: any,
  ) {
    const tenantId = dto.tenantId || tenantIdHeader || req?.user?.tenantId;
    const userId = req?.user?.id || req?.user?.sub;
    const userEmail = dto.userEmail || req?.user?.email;

    const result = await this.paymentService.createCheckoutSession(
      dto,
      tenantId,
      userId,
      userEmail,
    );
    return { statusCode: HttpStatus.CREATED, data: result };
  }

  @Get('session/:sessionId/status')
  async getSessionStatus(@Param('sessionId') sessionId: string) {
    const status =
      await this.paymentService.getCheckoutSessionStatus(sessionId);
    return { statusCode: HttpStatus.OK, data: status };
  }

  @Get('checkout-session/:sessionId/status')
  async getCheckoutSessionStatus(@Param('sessionId') sessionId: string) {
    const status =
      await this.paymentService.getCheckoutSessionStatus(sessionId);
    return { statusCode: HttpStatus.OK, data: status };
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
  async webhook(
    @Req() req: any,
    @Headers('stripe-signature') stripeSignature?: string,
    @Body() dto?: ProviderWebhookDto,
  ) {
    if (stripeSignature) {
      const rawPayload = req.rawBody || req.body;
      const result = await this.paymentService.handleStripeWebhook(
        rawPayload,
        stripeSignature,
      );
      return result;
    }
    const payment = await this.paymentService.handleProviderWebhook(
      dto as ProviderWebhookDto,
    );
    return { statusCode: HttpStatus.OK, data: payment };
  }

  @Post('stripe/webhook')
  async stripeWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawPayload = req.rawBody || req.body;
    return this.paymentService.handleStripeWebhook(rawPayload, signature || '');
  }
}
