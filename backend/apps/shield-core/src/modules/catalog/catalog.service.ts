import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const OFFER_FAMILIES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
  'EXPANSION_MODULE',
  'PROFESSIONAL_SERVICE',
] as const;
const ENTRY_OFFER_FAMILIES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
] as const;
export const BUNDLE_RELATIONSHIP_TYPES = [
  'INCLUDED_BY',
  'REQUIRES',
  'ALTERNATIVE_TO',
  'INCOMPATIBLE_WITH',
  'OVERRIDES',
] as const;
type BundleRelationshipType = (typeof BUNDLE_RELATIONSHIP_TYPES)[number];
interface BundleRule {
  relationshipType: BundleRelationshipType;
  targetSku: string;
}

export class CreateCatalogVersionDto {
  @IsString()
  versionLabel!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

export class CreateProductDto {
  @IsUUID()
  catalogVersionId!: string;

  /** Stable machine identity. Display names may change without changing this key. */
  @IsString()
  internalProductKey!: string;

  @IsString()
  sku!: string;

  @IsIn(OFFER_FAMILIES)
  offerFamily!: (typeof OFFER_FAMILIES)[number];

  @IsString()
  displayName!: string;

  @IsIn(['protected_resource', 'telemetry', 'module', 'service'])
  metricFamily!: 'protected_resource' | 'telemetry' | 'module' | 'service';

  @IsOptional()
  @IsArray()
  regionScope?: string[];
}

export class UpdateBundleRulesDto {
  @IsArray()
  rules!: BundleRule[];
}

export class CreatePriceBookDto {
  @IsUUID()
  catalogVersionId!: string;

  @IsUUID()
  productId!: string;

  /** Required for BESPOKE prices; omitted only for approved PUBLIC prices. */
  @IsOptional()
  @IsUUID()
  commercialAccountId?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['DIRECT', 'RESELLER', 'ZOIKO_ONE'])
  channel?: 'DIRECT' | 'RESELLER' | 'ZOIKO_ONE';

  @IsOptional()
  @IsIn(['BESPOKE', 'PUBLIC'])
  visibility?: 'BESPOKE' | 'PUBLIC';

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  minimumCommit?: number;

  @IsOptional()
  @IsNumber()
  overageRate?: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

export class RequestPriceBookApprovalDto {
  @IsString()
  reason!: string;

  @IsBoolean()
  marginGatePassed!: boolean;

  @IsOptional()
  @IsBoolean()
  publicDisclosureApproved?: boolean;

  @IsOptional()
  @IsNumber()
  marginImpact?: number;
}

export class DecidePriceBookApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private async getCatalogVersion(id: string) {
    const version = await this.prisma.catalogVersion.findUnique({
      where: { id },
    });
    if (!version)
      throw new NotFoundException(`Catalog version '${id}' not found`);
    return version;
  }

  private async requireDraftCatalog(id: string) {
    const version = await this.getCatalogVersion(id);
    if (version.status !== 'DRAFT') {
      throw new ConflictException(
        `Catalog version '${id}' is ${version.status}; only DRAFT catalogs can be changed`,
      );
    }
    return version;
  }

  private async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Product '${id}' not found`);
    return product;
  }

  private validateDates(effectiveFrom: Date, effectiveTo?: Date) {
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo must be later than effectiveFrom',
      );
    }
  }

  private validateBundleRules(rules: BundleRule[], productSku: string) {
    const seen = new Set<string>();
    for (const rule of rules) {
      if (
        !rule ||
        !BUNDLE_RELATIONSHIP_TYPES.includes(rule.relationshipType) ||
        typeof rule.targetSku !== 'string' ||
        !rule.targetSku.trim()
      ) {
        throw new BadRequestException(
          'Each bundle rule requires a supported relationshipType and targetSku',
        );
      }
      if (rule.targetSku === productSku) {
        throw new BadRequestException('A product cannot relate to itself');
      }
      const key = `${rule.relationshipType}:${rule.targetSku}`;
      if (seen.has(key))
        throw new BadRequestException(`Duplicate bundle rule '${key}'`);
      seen.add(key);
    }
  }

  async createCatalogVersion(dto: CreateCatalogVersionDto) {
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;
    this.validateDates(effectiveFrom, effectiveTo);
    this.logger.log(`Creating Catalog Version '${dto.versionLabel}'`);
    return this.prisma.catalogVersion.create({
      data: {
        version_label: dto.versionLabel,
        status: 'DRAFT',
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      },
    });
  }

  async approveCatalogVersion(catalogVersionId: string, approvedBy: string) {
    await this.requireDraftCatalog(catalogVersionId);
    const products = await this.prisma.product.findMany({
      where: { catalog_version_id: catalogVersionId },
    });
    for (const family of ENTRY_OFFER_FAMILIES) {
      if (
        !products.some(
          (product) =>
            product.offer_family === family &&
            product.launch_class === 'ENTRY_OFFER' &&
            product.release_status === 'RELEASED',
        )
      ) {
        throw new ConflictException(
          `Catalog approval requires a RELEASED ${family} entry offer`,
        );
      }
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

  async createProduct(dto: CreateProductDto) {
    await this.requireDraftCatalog(dto.catalogVersionId);
    const stableKey = dto.internalProductKey.trim();
    const sku = dto.sku.trim();
    if (!stableKey || !sku) {
      throw new BadRequestException(
        'internalProductKey and sku must not be empty',
      );
    }
    const priorIdentity = await this.prisma.product.findFirst({
      where: { internal_product_key: stableKey },
      orderBy: { created_at: 'desc' },
    });
    if (
      priorIdentity &&
      (priorIdentity.sku !== sku ||
        priorIdentity.offer_family !== dto.offerFamily)
    ) {
      throw new ConflictException(
        `Stable product key '${stableKey}' is already bound to SKU '${priorIdentity.sku}' and family '${priorIdentity.offer_family}'`,
      );
    }
    const entryOffer = ENTRY_OFFER_FAMILIES.includes(
      dto.offerFamily as (typeof ENTRY_OFFER_FAMILIES)[number],
    );
    return this.prisma.product.create({
      data: {
        catalog_version_id: dto.catalogVersionId,
        internal_product_key: stableKey,
        sku,
        offer_family: dto.offerFamily,
        display_name: dto.displayName,
        metric_family: dto.metricFamily,
        launch_class: entryOffer ? 'ENTRY_OFFER' : 'PHASE_GATED',
        release_status: entryOffer ? 'CANDIDATE' : 'GATED',
        requires: '[]',
        incompatible_with: '[]',
        bundle_rules: '[]',
        region_scope: JSON.stringify(dto.regionScope ?? []),
      },
    });
  }

  async updateBundleRules(productId: string, rules: BundleRule[]) {
    const product = await this.getProduct(productId);
    await this.requireDraftCatalog(product.catalog_version_id);
    this.validateBundleRules(rules, product.sku);
    const targets = await this.prisma.product.findMany({
      where: {
        catalog_version_id: product.catalog_version_id,
        sku: { in: rules.map((rule) => rule.targetSku) },
      },
      select: { sku: true },
    });
    const targetSkus = new Set(targets.map((target) => target.sku));
    const missing = rules
      .map((rule) => rule.targetSku)
      .filter((targetSku) => !targetSkus.has(targetSku));
    if (missing.length) {
      throw new BadRequestException(
        `Bundle rule targets are not in this catalog: ${[...new Set(missing)].join(', ')}`,
      );
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        bundle_rules: JSON.stringify(rules),
        requires: JSON.stringify(
          rules
            .filter((rule) => rule.relationshipType === 'REQUIRES')
            .map((rule) => rule.targetSku),
        ),
        incompatible_with: JSON.stringify(
          rules
            .filter((rule) => rule.relationshipType === 'INCOMPATIBLE_WITH')
            .map((rule) => rule.targetSku),
        ),
      },
    });
  }

  async releaseProduct(productId: string, releasedBy: string) {
    const product = await this.getProduct(productId);
    await this.requireDraftCatalog(product.catalog_version_id);
    const rules = JSON.parse(product.bundle_rules || '[]') as BundleRule[];
    this.validateBundleRules(rules, product.sku);
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        release_status: 'RELEASED',
        released_by: releasedBy,
        released_at: new Date(),
      },
    });
  }

  /** Enforces typed bundle rules against the exact frozen quote selection. */
  async validateProductSelection(catalogVersionId: string, skus: string[]) {
    const uniqueSkus = [...new Set(skus)];
    const products = await this.prisma.product.findMany({
      where: {
        catalog_version_id: catalogVersionId,
        sku: { in: uniqueSkus },
        release_status: 'RELEASED',
      },
    });
    const selected = new Set(products.map((product) => product.sku));
    const unavailable = uniqueSkus.filter((sku) => !selected.has(sku));
    if (unavailable.length) {
      throw new ConflictException(
        `Products are missing, gated, or unreleased in catalog '${catalogVersionId}': ${unavailable.join(', ')}`,
      );
    }

    for (const product of products) {
      const rules = JSON.parse(product.bundle_rules || '[]') as BundleRule[];
      this.validateBundleRules(rules, product.sku);
      for (const rule of rules) {
        if (
          rule.relationshipType === 'REQUIRES' &&
          !selected.has(rule.targetSku)
        ) {
          throw new ConflictException(
            `SKU '${product.sku}' requires '${rule.targetSku}' in the same quote`,
          );
        }
        if (
          selected.has(rule.targetSku) &&
          ['INCOMPATIBLE_WITH', 'ALTERNATIVE_TO'].includes(
            rule.relationshipType,
          )
        ) {
          throw new ConflictException(
            `SKU '${product.sku}' is ${rule.relationshipType} '${rule.targetSku}' and both cannot be selected`,
          );
        }
        if (
          selected.has(rule.targetSku) &&
          rule.relationshipType === 'INCLUDED_BY'
        ) {
          throw new ConflictException(
            `SKU '${product.sku}' is included by '${rule.targetSku}' and cannot be priced as a separate line`,
          );
        }
        if (
          selected.has(rule.targetSku) &&
          rule.relationshipType === 'OVERRIDES'
        ) {
          throw new ConflictException(
            `SKU '${product.sku}' overrides '${rule.targetSku}'; remove the overridden line`,
          );
        }
      }
    }
    return products;
  }

  async createPriceBook(dto: CreatePriceBookDto) {
    await this.requireDraftCatalog(dto.catalogVersionId);
    const product = await this.getProduct(dto.productId);
    if (product.catalog_version_id !== dto.catalogVersionId) {
      throw new BadRequestException(
        'Price book product must belong to the supplied catalog version',
      );
    }
    const visibility = dto.visibility ?? 'BESPOKE';
    if (visibility === 'BESPOKE' && !dto.commercialAccountId) {
      throw new BadRequestException(
        'BESPOKE pricing must be mapped to a commercialAccountId',
      );
    }
    if (visibility === 'PUBLIC' && dto.commercialAccountId) {
      throw new BadRequestException(
        'PUBLIC pricing cannot carry a bespoke commercial-account mapping',
      );
    }
    if (dto.commercialAccountId) {
      const account = await this.prisma.commercialAccount.findUnique({
        where: { id: dto.commercialAccountId },
      });
      if (!account || account.status !== 'ACTIVE') {
        throw new BadRequestException(
          'BESPOKE pricing requires an ACTIVE commercial account',
        );
      }
    }
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;
    this.validateDates(effectiveFrom, effectiveTo);
    for (const [field, value] of [
      ['unitPrice', dto.unitPrice],
      ['minimumCommit', dto.minimumCommit],
      ['overageRate', dto.overageRate],
    ] as const) {
      if (value !== undefined && value < 0) {
        throw new BadRequestException(`${field} cannot be negative`);
      }
    }
    return this.prisma.priceBook.create({
      data: {
        catalog_version_id: dto.catalogVersionId,
        product_id: dto.productId,
        commercial_account_id: dto.commercialAccountId,
        region: dto.region ?? 'GLOBAL',
        currency: (dto.currency ?? 'USD').toUpperCase(),
        channel: dto.channel ?? 'DIRECT',
        visibility,
        unit_price: dto.unitPrice ?? 0,
        minimum_commit: dto.minimumCommit ?? 0,
        overage_rate: dto.overageRate ?? 0,
        status: 'DRAFT',
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      },
    });
  }

  async requestPriceBookApproval(
    priceBookId: string,
    requestedBy: string,
    dto: RequestPriceBookApprovalDto,
  ) {
    const priceBook = await this.prisma.priceBook.findUnique({
      where: { id: priceBookId },
    });
    if (!priceBook)
      throw new NotFoundException(`Price book '${priceBookId}' not found`);
    if (priceBook.status !== 'DRAFT' && priceBook.status !== 'REJECTED') {
      throw new ConflictException(
        `Price book '${priceBookId}' is ${priceBook.status}; only DRAFT or REJECTED prices can be submitted`,
      );
    }
    if (!dto.marginGatePassed) {
      throw new BadRequestException(
        'Finance margin gate must pass before a price can be submitted',
      );
    }
    if (priceBook.visibility === 'PUBLIC' && !dto.publicDisclosureApproved) {
      throw new BadRequestException(
        'PUBLIC pricing requires explicit public-disclosure approval',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'PRICE_CHANGE',
          objectType: 'PriceBook',
          objectId: priceBook.id,
          requestedBy,
          reason: dto.reason,
          beforeSnapshot: {
            status: priceBook.status,
            approvalId: priceBook.approval_id,
          },
          proposedSnapshot: {
            unitPrice: priceBook.unit_price,
            minimumCommit: priceBook.minimum_commit,
            overageRate: priceBook.overage_rate,
            region: priceBook.region,
            currency: priceBook.currency,
            channel: priceBook.channel,
            visibility: priceBook.visibility,
            commercialAccountId: priceBook.commercial_account_id,
            effectiveFrom: priceBook.effective_from,
            effectiveTo: priceBook.effective_to,
            marginGatePassed: dto.marginGatePassed,
            publicDisclosureApproved: dto.publicDisclosureApproved ?? false,
          },
          marginImpact: dto.marginImpact,
          requiredApprovalRole: 'FINANCE_COMMERCIAL_APPROVER',
        },
        tx,
      );
      await tx.priceBook.update({
        where: { id: priceBook.id },
        data: { status: 'PENDING_APPROVAL', approval_id: approval.id },
      });
      return approval;
    });
  }

  async decidePriceBookApproval(
    priceBookId: string,
    approvalId: string,
    approverId: string,
    dto: DecidePriceBookApprovalDto,
  ) {
    const priceBook = await this.prisma.priceBook.findUnique({
      where: { id: priceBookId },
    });
    if (!priceBook || priceBook.approval_id !== approvalId) {
      throw new NotFoundException(
        `Approval '${approvalId}' is not linked to price book '${priceBookId}'`,
      );
    }
    const approval = await this.approvals.decideApproval(
      approvalId,
      approverId,
      dto.decision,
      dto.reason,
    );
    if (dto.decision === 'REJECTED') {
      await this.prisma.priceBook.update({
        where: { id: priceBookId },
        data: { status: 'REJECTED' },
      });
    }
    return approval;
  }

  async approvePriceBook(priceBookId: string, approvedBy: string) {
    const priceBook = await this.prisma.priceBook.findUnique({
      where: { id: priceBookId },
    });
    if (!priceBook)
      throw new NotFoundException(`Price book '${priceBookId}' not found`);
    if (priceBook.status !== 'PENDING_APPROVAL' || !priceBook.approval_id) {
      throw new ConflictException(
        'Price book must have a linked approved Finance/Commercial decision',
      );
    }
    const approval = await this.approvals.getApprovalById(
      priceBook.approval_id,
    );
    if (
      approval.status !== 'APPROVED' ||
      approval.object_type !== 'PriceBook' ||
      approval.object_id !== priceBookId
    ) {
      throw new ConflictException(
        `Price book approval '${approval.id}' is not APPROVED for this price`,
      );
    }
    const proposed = JSON.parse(approval.proposed_snapshot) as Record<
      string,
      unknown
    >;
    if (proposed.marginGatePassed !== true) {
      throw new ConflictException('Approved price snapshot lacks margin gate');
    }
    if (
      priceBook.visibility === 'PUBLIC' &&
      proposed.publicDisclosureApproved !== true
    ) {
      throw new ConflictException(
        'Approved PUBLIC price snapshot lacks disclosure approval',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.priceBook.update({
        where: { id: priceBookId },
        data: {
          status: 'APPROVED',
          margin_gate_passed: true,
          public_disclosure_approved:
            proposed.publicDisclosureApproved === true,
          approved_by: approvedBy,
          approved_at: new Date(),
        },
      });
      await tx.commercialApproval.update({
        where: { id: approval.id },
        data: { status: 'APPLIED', applied_at: new Date() },
      });
      return updated;
    });
  }

  async getActivePriceBook(
    sku: string,
    region = 'GLOBAL',
    currency = 'USD',
    commercialAccountId?: string,
    catalogVersionId?: string,
  ) {
    const now = new Date();
    const priceBook = await this.prisma.priceBook.findFirst({
      where: {
        status: 'APPROVED',
        margin_gate_passed: true,
        region,
        currency: currency.toUpperCase(),
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        product: {
          sku,
          ...(catalogVersionId ? { catalog_version_id: catalogVersionId } : {}),
          release_status: 'RELEASED',
          catalogVersion: { status: 'APPROVED' },
        },
        AND: [
          {
            OR: [
              ...(commercialAccountId
                ? [
                    {
                      visibility: 'BESPOKE',
                      commercial_account_id: commercialAccountId,
                    },
                  ]
                : []),
              { visibility: 'PUBLIC', public_disclosure_approved: true },
            ],
          },
        ],
      },
      include: { product: true, catalogVersion: true },
      orderBy: { effective_from: 'desc' },
    });
    if (!priceBook) {
      this.logger.warn(
        `Price book query FAILED CLOSED for SKU '${sku}' (${region}/${currency})`,
      );
      return null;
    }
    return priceBook;
  }

  async getApprovedProducts() {
    return this.prisma.product.findMany({
      where: {
        release_status: 'RELEASED',
        catalogVersion: { status: 'APPROVED' },
      },
      include: {
        priceBooks: {
          where: {
            status: 'APPROVED',
            margin_gate_passed: true,
            visibility: 'PUBLIC',
            public_disclosure_approved: true,
          },
        },
      },
    });
  }
}
