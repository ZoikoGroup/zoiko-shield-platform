import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { QuoteService } from './quote.service';
import { SubscriptionService } from './subscription.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { assertTransition } from '../commerce/state-machine.util';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['PROVISIONED', 'REJECTED', 'CANCELLED'],
  PROVISIONED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class CreateOrderDto {
  @IsUUID()
  quoteId!: string;

  @IsString()
  createdBy!: string;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteService: QuoteService,
    private readonly contractService: ContractStateService,
    private readonly subscriptionService: SubscriptionService,
    private readonly idempotencyService: IdempotencyService,
    private readonly killSwitchService: CommercialKillSwitchService,
  ) {}

  async getOrderById(orderId: string) {
    const order = await this.prisma.commercialOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) {
      throw new NotFoundException(`Order '${orderId}' not found`);
    }
    return order;
  }

  /**
   * A quote can only ever be converted into one order: the idempotency key
   * is derived from the quote so retries are naturally safe even without a
   * client-supplied header.
   */
  async createOrderFromQuote(dto: CreateOrderDto, idempotencyKey?: string) {
    await this.killSwitchService.assertNotBlocked('ORDER_CREATION');

    const key = idempotencyKey || `order-from-quote-${dto.quoteId}`;

    const result = await this.idempotencyService.run(
      {
        key,
        operation: 'commercial.order.create_from_quote',
        actorId: dto.createdBy,
        requestPayload: dto,
      },
      async () => {
        const quote = await this.quoteService.getQuoteById(dto.quoteId);
        if (quote.status !== 'APPROVED') {
          throw new ConflictException({
            statusCode: 409,
            error: 'QUOTE_NOT_APPROVED',
            message: `Quote '${dto.quoteId}' is in status '${quote.status}', not APPROVED`,
          });
        }

        const order = await this.prisma.commercialOrder.create({
          data: {
            quote_id: quote.id,
            commercial_account_id: quote.commercial_account_id,
            status: 'CREATED',
            idempotency_key: key,
            created_by: dto.createdBy,
            lines: {
              create: quote.lines.map((l) => ({
                product_id: l.product_id,
                quantity: l.quantity,
                unit_price: l.unit_price,
              })),
            },
          },
          include: { lines: true },
        });

        await this.quoteService.markConverted(quote.id);

        return { statusCode: 201, body: order };
      },
    );

    return result.body;
  }

  /**
   * Provisions the order: creates the Contract + Subscription and marks
   * the order PROVISIONED in a single database transaction. No possible
   * partially-provisioned commercial state — either all three writes land
   * or none do. Contract/subscription creation reuse ContractStateService
   * and SubscriptionService (via their optional `tx` parameter) rather
   * than duplicating snapshot-hash/creation logic.
   */
  async provisionOrder(orderId: string, termMonths = 12) {
    const order = await this.getOrderById(orderId);
    assertTransition(ALLOWED_TRANSITIONS, order.status, 'PROVISIONED', 'order');

    const quote = await this.quoteService.getQuoteById(order.quote_id);

    const termStart = new Date();
    const termEnd = new Date(termStart);
    termEnd.setMonth(termEnd.getMonth() + termMonths);

    return this.prisma.$transaction(async (tx) => {
      const contract = await this.contractService.createContract(
        {
          commercialAccountId: order.commercial_account_id,
          catalogVersionId: quote.catalog_version_id,
          termStart,
          termEnd,
          orderConfig: { orderId: order.id, lines: order.lines },
        },
        tx,
      );

      const updatedOrder = await tx.commercialOrder.update({
        where: { id: orderId },
        data: { status: 'PROVISIONED', contract_id: contract.id },
      });

      const subscription = await this.subscriptionService.createSubscription(
        {
          orderId: order.id,
          commercialAccountId: order.commercial_account_id,
          contractId: contract.id,
          effectiveFrom: termStart,
          effectiveTo: termEnd,
        },
        tx,
      );

      return { order: updatedOrder, contract, subscription };
    });
  }

  async rejectOrder(orderId: string) {
    const order = await this.getOrderById(orderId);
    assertTransition(ALLOWED_TRANSITIONS, order.status, 'REJECTED', 'order');
    return this.prisma.commercialOrder.update({
      where: { id: orderId },
      data: { status: 'REJECTED' },
    });
  }
}
