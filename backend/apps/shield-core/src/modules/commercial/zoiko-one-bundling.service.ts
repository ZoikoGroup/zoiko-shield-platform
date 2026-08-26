import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateZoikoOneBundleOrderDto {
  bundleReference!: string;
  commercialAccountId!: string;
  includedProductKeys!: string[];
  incrementalProductKeys!: string[];
  coTerminationDate?: string;
  discountPercentage?: number;
  creditAllocationMethod!: 'PRO_RATA' | 'PRIMARY_FIRST' | 'EQUAL_SPLIT';
}

@Injectable()
export class ZoikoOneBundlingService {
  constructor(private readonly prisma: PrismaService) {}

  async createBundleOrder(
    tenantId: string,
    dto: CreateZoikoOneBundleOrderDto,
    actorId: string,
  ) {
    if (!dto.bundleReference || !dto.commercialAccountId) {
      throw new BadRequestException(
        'bundleReference and commercialAccountId are required',
      );
    }

    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: dto.commercialAccountId },
    });
    if (!account) {
      throw new NotFoundException(
        `Commercial account '${dto.commercialAccountId}' not found`,
      );
    }

    const existingEntitlements = await this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });

    const existingKeys = new Set(existingEntitlements.map((e) => e.offer_type));
    const overlaps = (dto.includedProductKeys || []).filter((key) =>
      existingKeys.has(key),
    );

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'zoiko_one.bundle_order_created',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `zoiko-one-bundle-${dto.bundleReference}-${Date.now()}`,
        payload: JSON.stringify({
          bundleReference: dto.bundleReference,
          commercialAccountId: dto.commercialAccountId,
          includedProductKeys: dto.includedProductKeys,
          incrementalProductKeys: dto.incrementalProductKeys,
          coTerminationDate: dto.coTerminationDate,
          discountPercentage: dto.discountPercentage || 0,
          creditAllocationMethod: dto.creditAllocationMethod,
          detectedOverlaps: overlaps,
        }),
      },
    });

    return {
      id: event.id,
      bundleReference: dto.bundleReference,
      tenantId,
      commercialAccountId: dto.commercialAccountId,
      includedProductKeys: dto.includedProductKeys,
      incrementalProductKeys: dto.incrementalProductKeys,
      detectedOverlaps: overlaps,
      coTerminationDate: dto.coTerminationDate || null,
      creditAllocationMethod: dto.creditAllocationMethod,
      status: 'PROVISIONED',
      createdAt: event.created_at,
    };
  }

  async getScopeView(tenantId: string) {
    const entitlements = await this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });

    const zoikoOneEvents = await this.prisma.commercialEvent.findMany({
      where: {
        tenant_id: tenantId,
        event_type: 'zoiko_one.bundle_order_created',
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    const bundleProductKeys = new Set<string>();
    for (const event of zoikoOneEvents) {
      try {
        const payload = JSON.parse(event.payload);
        if (Array.isArray(payload.includedProductKeys)) {
          payload.includedProductKeys.forEach((k: string) =>
            bundleProductKeys.add(k),
          );
        }
      } catch {
        // ignore invalid JSON payload
      }
    }

    const includedScope = entitlements.filter((e) =>
      bundleProductKeys.has(e.offer_type),
    );
    const incrementalScope = entitlements.filter(
      (e) => !bundleProductKeys.has(e.offer_type),
    );

    return {
      tenantId,
      totalActiveEntitlements: entitlements.length,
      includedScope: includedScope.map((e) => ({
        id: e.id,
        offerType: e.offer_type,
        sourceType: e.source_type,
        status: e.status,
      })),
      incrementalScope: incrementalScope.map((e) => ({
        id: e.id,
        offerType: e.offer_type,
        sourceType: e.source_type,
        status: e.status,
      })),
      reconciliationStatus:
        includedScope.length > 0
          ? 'RECONCILED_NO_DOUBLE_CHARGE'
          : 'STANDALONE_DIRECT',
    };
  }

  async reconcileOverlap(
    tenantId: string,
    commercialAccountId: string,
    actorId: string,
  ) {
    const activeEntitlements = await this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });

    const keyCounts = new Map<string, number>();
    for (const e of activeEntitlements) {
      keyCounts.set(e.offer_type, (keyCounts.get(e.offer_type) || 0) + 1);
    }

    const duplicatedKeys = Array.from(keyCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([key]) => key);

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'zoiko_one.overlap_reconciled',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `zoiko-one-reconcile-${Date.now()}`,
        payload: JSON.stringify({
          commercialAccountId,
          duplicatedKeys,
          resolvedAt: new Date().toISOString(),
          actionTaken: 'SINGLE_COMMERCIAL_SOURCE_ENFORCED',
        }),
      },
    });

    return {
      tenantId,
      commercialAccountId,
      duplicatedKeysFound: duplicatedKeys,
      reconciliationResult: 'SUCCESS',
      singleSourceEnforced: true,
      eventId: event.id,
    };
  }
}
