import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateDraftInvoiceDto {
  commercialAccountId!: string;
  contractId!: string;
  currency?: string;
  lineItems!: Array<{ sku: string; amount: number; description: string }>;
}

@Injectable()
export class InvoiceSkeletonService {
  private readonly logger = new Logger(InvoiceSkeletonService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create draft invoice
   */
  async createDraftInvoice(dto: CreateDraftInvoiceDto) {
    const totalAmount = dto.lineItems.reduce((sum, item) => sum + item.amount, 0);

    return this.prisma.commercialInvoice.create({
      data: {
        commercial_account_id: dto.commercialAccountId,
        contract_id: dto.contractId,
        currency: dto.currency || 'USD',
        total_amount: totalAmount,
        status: 'DRAFT',
        immutable_snapshot: JSON.stringify(dto.lineItems),
      },
    });
  }

  /**
   * Issue invoice (FIN-02: freezes line items and locks invoice)
   */
  async issueInvoice(invoiceId: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVAL_PENDING') {
      throw new ConflictException(`Invoice '${invoiceId}' is in status '${invoice.status}' and cannot be re-issued (FIN-02 immutability rule)`);
    }

    return this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'ISSUED',
        issued_at: new Date(),
      },
    });
  }

  /**
   * Get invoices for commercial account
   */
  async getInvoicesByAccount(commercialAccountId: string) {
    return this.prisma.commercialInvoice.findMany({
      where: { commercial_account_id: commercialAccountId },
      orderBy: { created_at: 'desc' },
    });
  }
}
