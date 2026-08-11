import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsPositive, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import {
  InvoiceSkeletonService,
  CreateDraftInvoiceDto,
  AddInvoiceLineDto,
  RecordFxRateDto,
} from './invoice-skeleton.service';

export class IssueNoteDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard)
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
   * POST /api/v1/billing/invoices/:id/lines
   * Add a structured, tax-resolved invoice line (Part 10/12)
   */
  @Post(':id/lines')
  async addInvoiceLine(@Param('id') id: string, @Body() dto: AddInvoiceLineDto) {
    const line = await this.invoiceService.addInvoiceLine(id, dto);
    return { statusCode: HttpStatus.CREATED, data: line };
  }

  /**
   * PATCH /api/v1/billing/invoices/:id/fx-rate
   * Record FX rate pre-issue (Part 11)
   */
  @Patch(':id/fx-rate')
  async recordFxRate(@Param('id') id: string, @Body() dto: RecordFxRateDto) {
    const invoice = await this.invoiceService.recordFxRate(id, dto);
    return { statusCode: HttpStatus.OK, data: invoice };
  }

  /**
   * POST /api/v1/billing/invoices/:id/credit-notes
   * Append-only correction against an ISSUED invoice (Part 12)
   */
  @Post(':id/credit-notes')
  async issueCreditNote(@Param('id') id: string, @Body() dto: IssueNoteDto) {
    const note = await this.invoiceService.issueCreditNote(id, dto.amount, dto.reason);
    return { statusCode: HttpStatus.CREATED, data: note };
  }

  /**
   * POST /api/v1/billing/invoices/:id/debit-notes
   */
  @Post(':id/debit-notes')
  async issueDebitNote(@Param('id') id: string, @Body() dto: IssueNoteDto) {
    const note = await this.invoiceService.issueDebitNote(id, dto.amount, dto.reason);
    return { statusCode: HttpStatus.CREATED, data: note };
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
