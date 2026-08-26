import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';
import {
  AccountingHandoffExportDto,
  AddPaymentMethodDto,
  PaymentMethodService,
} from './payment-method.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/payments/methods')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  /**
   * GET /api/v1/payments/methods
   * List stored payment methods for commercial account.
   */
  @Get()
  async listMethods(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('commercialAccountId') commercialAccountId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.paymentMethodService.listPaymentMethods(
      tenantId,
      commercialAccountId,
    );
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/payments/methods
   * Save a new payment method for commercial account.
   */
  @Post()
  async addMethod(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: AddPaymentMethodDto,
    @Headers('x-actor-id') actorId = 'customer-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.paymentMethodService.addPaymentMethod(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Payment method saved successfully',
      data,
    };
  }

  /**
   * GET /api/v1/payments/methods/merchant-config
   * Seller entity & merchant processor setup configuration.
   */
  @Get('merchant-config')
  getMerchantConfig() {
    const data = this.paymentMethodService.getSellerMerchantConfig();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/payments/methods/accounting-handoff
   * Export accounting period handoff batch for ERP system integration.
   */
  @Post('accounting-handoff')
  async exportAccountingHandoff(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: AccountingHandoffExportDto,
    @Headers('x-actor-id') actorId = 'finance-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.paymentMethodService.exportAccountingHandoff(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Accounting handoff batch exported successfully',
      data,
    };
  }
}
