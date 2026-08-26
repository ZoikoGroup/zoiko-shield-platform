import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { QuoteService } from './quote.service';
import { SubscriptionService } from './subscription.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { assertTransition } from '../commerce/state-machine.util';
import { createHash } from 'crypto';
import type { ResolvedBundleExpansion } from '../catalog/catalog.service';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['PROVISIONED', 'REJECTED', 'CANCELLED'],
  PROVISIONED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class CreateOrderDto {
  @IsUUID()
  quoteId!: string;
}

interface OrderContext {
  tenantId: string;
  environmentId: string;
  actorId: string;
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

  private parseQuoteSnapshot(snapshot: string): {
    currency?: string;
    lines?: Array<{ productId: string; sku: string }>;
    bundleExpansions?: ResolvedBundleExpansion[];
  } {
    try {
      return JSON.parse(snapshot || '{}');
    } catch {
      throw new ConflictException(
        'Approved quote snapshot is invalid; order bundle expansion cannot be reconstructed safely',
      );
    }
  }

  private money(value: number) {
    return Number(value.toFixed(4));
  }

  async getOrderById(orderId: string, tenantId: string, environmentId: string) {
    const order = await this.prisma.commercialOrder.findFirst({
      where: {
        id: orderId,
        quote: { tenant_id: tenantId, environment_id: environmentId },
      },
      include: {
        lines: {
          include: {
            bundleEntitlement: true,
            bundleServiceObligation: true,
            bundleMeterProjection: true,
            bundleCostAllocation: true,
            bundleClaimEligibility: true,
          },
        },
      },
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
  async createOrderFromQuote(
    context: OrderContext,
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ) {
    await this.killSwitchService.assertNotBlocked('ORDER_CREATION');

    const key = idempotencyKey || `order-from-quote-${dto.quoteId}`;

    const result = await this.idempotencyService.run(
      {
        key,
        operation: 'commercial.order.create_from_quote',
        tenantId: context.tenantId,
        actorId: context.actorId,
        requestPayload: dto,
      },
      async () => {
        const quote = await this.quoteService.getQuoteById(
          dto.quoteId,
          context.tenantId,
          context.environmentId,
        );
        if (quote.status !== 'APPROVED') {
          throw new ConflictException({
            statusCode: 409,
            error: 'QUOTE_NOT_APPROVED',
            message: `Quote '${dto.quoteId}' is in status '${quote.status}', not APPROVED`,
          });
        }

        const frozen = this.parseQuoteSnapshot(quote.snapshot);
        const frozenLineByProduct = new Map(
          (frozen.lines ?? []).map((line) => [line.productId, line]),
        );
        const componentLines = (frozen.bundleExpansions ?? []).flatMap(
          (expansion) => {
            const parent = quote.lines.find(
              (line) => line.product_id === expansion.parentProductId,
            );
            if (!parent) {
              throw new ConflictException(
                `Frozen bundle parent '${expansion.parentSku}' has no approved quote line`,
              );
            }
            return expansion.components.map((component) => {
              const quantity = parent.quantity * component.quantity;
              const allocatedListUnit = this.money(
                (Number(parent.unit_price) * component.allocationPercent) /
                  100 /
                  component.quantity,
              );
              const allocatedNetUnit = this.money(
                allocatedListUnit *
                  (1 - Number(parent.line_discount_percent) / 100),
              );
              const componentSnapshot = JSON.stringify({
                parentProductId: expansion.parentProductId,
                parentSku: expansion.parentSku,
                ...component,
              });
              return {
                product_id: component.productId,
                quantity,
                list_unit_price: allocatedListUnit,
                discount_percent: parent.line_discount_percent,
                unit_price: allocatedNetUnit,
                currency: frozen.currency ?? quote.currency ?? 'USD',
                line_type: 'BUNDLE_COMPONENT',
                billable: false,
                catalog_sku: component.sku,
                bundle_parent_product_id: expansion.parentProductId,
                component_type: component.componentType,
                entitlement_offer_type: component.entitlementOfferType,
                meter_definition_id: component.meterDefinitionId,
                service_obligation_type: component.serviceObligationType,
                cost_class: component.costClass,
                cost_allocation_percent: component.allocationPercent,
                claim_key: component.claimKey,
                claim_register_id: component.claimRegisterId,
                invoice_presentation: component.invoicePresentation,
                component_snapshot: componentSnapshot,
                component_snapshot_hash: createHash('sha256')
                  .update(componentSnapshot)
                  .digest('hex'),
                projection_status: 'PENDING_PROVISIONING',
              };
            });
          },
        );

        const order = await this.prisma.commercialOrder.create({
          data: {
            quote_id: quote.id,
            commercial_account_id: quote.commercial_account_id,
            status: 'CREATED',
            idempotency_key: key,
            created_by: context.actorId,
            lines: {
              create: [
                ...quote.lines.map((l) => ({
                  product_id: l.product_id,
                  quantity: l.quantity,
                  list_unit_price: l.unit_price,
                  discount_percent: l.line_discount_percent,
                  unit_price: this.money(
                    Number(l.unit_price) *
                      (1 - Number(l.line_discount_percent) / 100),
                  ),
                  currency: frozen.currency ?? quote.currency ?? 'USD',
                  line_type: 'CUSTOMER',
                  billable: true,
                  catalog_sku: frozenLineByProduct.get(l.product_id)?.sku ?? '',
                })),
                ...componentLines,
              ],
            },
          },
          include: { lines: true },
        });

        await this.quoteService.markConverted(
          quote.id,
          context.tenantId,
          context.environmentId,
        );

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
  async provisionOrder(
    context: OrderContext,
    orderId: string,
    termMonths = 12,
  ) {
    const order = await this.getOrderById(
      orderId,
      context.tenantId,
      context.environmentId,
    );
    assertTransition(ALLOWED_TRANSITIONS, order.status, 'PROVISIONED', 'order');

    const quote = await this.quoteService.getQuoteById(
      order.quote_id,
      context.tenantId,
      context.environmentId,
    );

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
          orderConfig: {
            orderId: order.id,
            quoteId: quote.id,
            quoteKey: quote.quote_key,
            quoteVersion: quote.version,
            quoteConfigurationHash: quote.configuration_hash,
            quoteValidationId: quote.validation?.id,
            quoteSnapshot: JSON.parse(quote.snapshot),
            discountReview: quote.discountReview
              ? {
                  id: quote.discountReview.id,
                  status: quote.discountReview.status,
                  policyIds: JSON.parse(quote.discountReview.policy_ids),
                  grossMarginByServiceClass: JSON.parse(
                    quote.discountReview.gross_margin_by_service_class,
                  ),
                  partnerPassThrough: JSON.parse(
                    quote.discountReview.partner_pass_through,
                  ),
                  commercialReason: quote.discountReview.commercial_reason,
                  termMonths: quote.discountReview.term_months,
                  rampSchedule: JSON.parse(quote.discountReview.ramp_schedule),
                  minimumCommitAmount: Number(
                    quote.discountReview.minimum_commit_amount,
                  ),
                  catalogMinimumCommitAmount: Number(
                    quote.discountReview.catalog_minimum_commit_amount,
                  ),
                  discountExpiresAt: quote.discountReview.discount_expires_at,
                  requiredApprovalRole:
                    quote.discountReview.required_approval_role,
                  authorityRank: quote.discountReview.authority_rank,
                  technicalAuthorityHash:
                    quote.discountReview.technical_authority_hash,
                  approvalId: quote.discountReview.approval_id,
                }
              : null,
            roadmapCommitments: quote.roadmapCommitments.map((commitment) => ({
              id: commitment.id,
              commitmentKey: commitment.commitment_key,
              targetProductId: commitment.target_product_id,
              featureKey: commitment.feature_key,
              nonGaLanguage: commitment.non_ga_language,
              conditions: JSON.parse(commitment.conditions),
              deliveryDependencyType: commitment.delivery_dependency_type,
              deliveryDependencyReference:
                commitment.delivery_dependency_reference,
              targetDeliveryDate: commitment.target_delivery_date,
              status: commitment.status,
              entitlementEffect: commitment.entitlement_effect,
              runtimeAccessStatus: commitment.runtime_access_status,
            })),
            lines: order.lines,
          },
        },
        tx,
      );

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

      const expandedComponents = [];
      for (const line of order.lines.filter(
        (candidate) => candidate.line_type === 'BUNDLE_COMPONENT',
      )) {
        if (
          !line.component_type ||
          !line.cost_class ||
          line.cost_allocation_percent === null ||
          !line.claim_key ||
          !line.claim_register_id
        ) {
          throw new ConflictException(
            `Bundle component order line '${line.id}' is incomplete and cannot be provisioned`,
          );
        }

        const entitlement = line.entitlement_offer_type
          ? await tx.entitlement.create({
              data: {
                commercial_account_id: order.commercial_account_id,
                tenant_id: context.tenantId,
                offer_type: line.entitlement_offer_type,
                source_type: 'BUNDLE_COMPONENT',
                source_id: line.id,
                bundle_order_line_id: line.id,
                status: 'PENDING_ACTIVATION',
                effective_from: termStart,
                effective_to: termEnd,
              },
            })
          : null;
        const serviceObligation = line.service_obligation_type
          ? await tx.serviceObligation.create({
              data: {
                tenant_id: context.tenantId,
                environment_id: context.environmentId,
                contract_id: contract.id,
                bundle_order_line_id: line.id,
                obligation_key: `bundle:${line.id}`,
                obligation_type: line.service_obligation_type,
                obligation_scope: line.component_snapshot,
                claim_eligibility: false,
                claim_eligibility_reason: 'PENDING_CLAIM_EVALUATION',
                status: 'NOT_DUE',
              },
            })
          : null;
        const meterProjection = line.meter_definition_id
          ? await tx.bundleMeterProjection.create({
              data: {
                order_line_id: line.id,
                contract_id: contract.id,
                subscription_id: subscription.id,
                tenant_id: context.tenantId,
                environment_id: context.environmentId,
                meter_definition_id: line.meter_definition_id,
                status: 'PENDING_GOVERNANCE',
              },
            })
          : null;
        const costAllocation = await tx.bundleCostAllocation.create({
          data: {
            order_line_id: line.id,
            contract_id: contract.id,
            subscription_id: subscription.id,
            cost_class: line.cost_class,
            allocation_percent: line.cost_allocation_percent,
            allocated_revenue: this.money(
              Number(line.unit_price) * line.quantity,
            ),
            currency: line.currency,
            status: 'ALLOCATED',
          },
        });
        const claimEligibility = await tx.bundleClaimEligibility.create({
          data: {
            order_line_id: line.id,
            contract_id: contract.id,
            subscription_id: subscription.id,
            tenant_id: context.tenantId,
            environment_id: context.environmentId,
            region: quote.region,
            claim_key: line.claim_key,
            claim_register_id: line.claim_register_id,
            status: 'PENDING_EVALUATION',
          },
        });
        await tx.commercialOrderLine.update({
          where: { id: line.id },
          data: { projection_status: 'EXPANDED' },
        });
        expandedComponents.push({
          orderLineId: line.id,
          entitlement,
          meterProjection,
          serviceObligation,
          costAllocation,
          claimEligibility,
        });
      }

      // The order is the transaction's final state transition. Database
      // invariants validate the complete component projection set here.
      const updatedOrder = await tx.commercialOrder.update({
        where: { id: orderId },
        data: { status: 'PROVISIONED', contract_id: contract.id },
      });

      return {
        order: updatedOrder,
        contract,
        subscription,
        bundleComponents: expandedComponents,
      };
    });
  }

  async rejectOrder(orderId: string, tenantId: string, environmentId: string) {
    const order = await this.getOrderById(orderId, tenantId, environmentId);
    assertTransition(ALLOWED_TRANSITIONS, order.status, 'REJECTED', 'order');
    return this.prisma.commercialOrder.update({
      where: { id: orderId },
      data: { status: 'REJECTED' },
    });
  }
}
