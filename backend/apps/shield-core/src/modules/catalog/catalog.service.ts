import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateCatalogVersionDto {
  versionLabel!: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

export class CreateProductDto {
  catalogVersionId!: string;
  sku!: string;
  offerFamily!: 'MANAGED_DEFENSE' | 'CONTINUOUS_ASSURANCE' | 'EXPANSION_MODULE' | 'PROFESSIONAL_SERVICE';
  displayName!: string;
  metricFamily!: 'protected_resource' | 'telemetry' | 'module' | 'service';
  requires?: string[];
  incompatibleWith?: string[];
  regionScope?: string[];
}

export class CreatePriceBookDto {
  catalogVersionId!: string;
  productId!: string;
  region?: string;
  currency?: string;
  channel?: 'DIRECT' | 'RESELLER' | 'ZOIKO_ONE';
  unitPrice?: number;
  minimumCommit?: number;
  overageRate?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new catalog version (starts in DRAFT status)
   */
  async createCatalogVersion(dto: CreateCatalogVersionDto) {
    this.logger.log(`Creating Catalog Version '${dto.versionLabel}'`);

    return this.prisma.catalogVersion.create({
      data: {
        version_label: dto.versionLabel,
        status: 'DRAFT',
        effective_from: dto.effectiveFrom || new Date(),
        effective_to: dto.effectiveTo,
      },
    });
  }

  /**
   * Approve a catalog version (moves DRAFT -> APPROVED)
   */
  async approveCatalogVersion(catalogVersionId: string, approvedBy: string) {
    const version = await this.prisma.catalogVersion.findUnique({
      where: { id: catalogVersionId },
    });

    if (!version) {
      throw new NotFoundException(`Catalog version '${catalogVersionId}' not found`);
    }

    return this.prisma.catalogVersion.update({
      where: { id: catalogVersionId },
      data: {
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
  }

  /**
   * Register product SKU under a catalog version
   */
  async createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        catalog_version_id: dto.catalogVersionId,
        sku: dto.sku,
        offer_family: dto.offerFamily,
        display_name: dto.displayName,
        metric_family: dto.metricFamily,
        requires: JSON.stringify(dto.requires || []),
        incompatible_with: JSON.stringify(dto.incompatibleWith || []),
        region_scope: JSON.stringify(dto.regionScope || []),
      },
    });
  }

  /**
   * Register price book under product and catalog version
   */
  async createPriceBook(dto: CreatePriceBookDto) {
    return this.prisma.priceBook.create({
      data: {
        catalog_version_id: dto.catalogVersionId,
        product_id: dto.productId,
        region: dto.region || 'GLOBAL',
        currency: dto.currency || 'USD',
        channel: dto.channel || 'DIRECT',
        unit_price: dto.unitPrice || 0.0,
        minimum_commit: dto.minimumCommit || 0.0,
        overage_rate: dto.overageRate || 0.0,
        status: 'DRAFT',
        effective_from: dto.effectiveFrom || new Date(),
        effective_to: dto.effectiveTo,
      },
    });
  }

  /**
   * Approve price book (moves DRAFT -> APPROVED and sets margin_gate_passed = true)
   */
  async approvePriceBook(priceBookId: string) {
    return this.prisma.priceBook.update({
      where: { id: priceBookId },
      data: {
        status: 'APPROVED',
        margin_gate_passed: true,
      },
    });
  }

  /**
   * Query active price book for a SKU (ADR-06 / B2 fail-closed rule)
   * Must filter status = 'APPROVED' AND now() BETWEEN effective_from AND effective_to.
   */
  async getActivePriceBook(sku: string, region = 'GLOBAL', currency = 'USD') {
    const now = new Date();

    const priceBook = await this.prisma.priceBook.findFirst({
      where: {
        status: 'APPROVED',
        region,
        currency,
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        product: { sku },
      },
      include: {
        product: true,
        catalogVersion: true,
      },
    });

    if (!priceBook) {
      this.logger.warn(`Price book query FAILED CLOSED for SKU '${sku}' (${region}/${currency})`);
      return null;
    }

    return priceBook;
  }

  /**
   * List all products in approved catalog
   */
  async getApprovedProducts() {
    return this.prisma.product.findMany({
      where: {
        catalogVersion: { status: 'APPROVED' },
      },
      include: { priceBooks: true },
    });
  }
}
