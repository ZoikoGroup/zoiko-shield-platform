import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { InvoiceSkeletonService, CreateDraftInvoiceDto } from './invoice-skeleton.service';

@Controller('api/v1/billing/invoices')
export class BillingController {
  constructor(private readonly invoiceService: InvoiceSkeletonService) {}

  /**
   * POST /api/v1/billing/invoices
   * Create draft commercial invoice
   */
  @Post()
  async createDraftInvoice(@Body() dto: CreateDraftInvoiceDto) {
    const invoice = await this.invoiceService.createDraftInvoice(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: invoice,
    };
  }

  /**
   * PATCH /api/v1/billing/invoices/:id/issue
   * Issue commercial invoice (FIN-02 immutability rule)
   */
  @Patch(':id/issue')
  async issueInvoice(@Param('id') id: string) {
    const invoice = await this.invoiceService.issueInvoice(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Invoice issued and locked',
      data: invoice,
    };
  }

  /**
   * GET /api/v1/billing/invoices
   * Get invoices for commercial account
   */
  @Get()
  async getInvoices(@Query('accountId') accountId: string) {
    const invoices = await this.invoiceService.getInvoicesByAccount(accountId);
    return {
      statusCode: HttpStatus.OK,
      data: invoices,
    };
  }
}
