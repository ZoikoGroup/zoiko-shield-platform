import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO31661Alpha2,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { assertTransition } from '../commerce/state-machine.util';

export const BILLING_CLASSIFICATIONS = [
  'COMMERCIAL_DIRECT',
  'COMMERCIAL_ZOIKO_ONE',
  'COMMERCIAL_RESELLER',
  'DESIGN_PARTNER',
  'PILOT',
  'EVALUATION',
  'INTERNAL',
  'DEMO',
  'SANDBOX',
  'PARTNER_MANAGED',
] as const;

/** Classifications which can never generate live customer charges. */
export const NON_COMMERCIAL_CLASSIFICATIONS = [
  'INTERNAL',
  'DEMO',
  'SANDBOX',
  'EVALUATION',
  'PILOT',
];

const BINDING_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['SUSPENDED', 'ENDED'],
  SUSPENDED: ['ACTIVE', 'ENDED'],
  ENDED: [],
};

export class CommercialBillingAddressDto {
  @IsString()
  @IsNotEmpty()
  line1!: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsOptional()
  @IsString()
  stateOrProvince?: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsISO31661Alpha2()
  countryCode!: string;
}

export class CommercialTaxFactsDto {
  @IsISO31661Alpha2()
  countryCode!: string;

  @IsOptional()
  @IsString()
  taxRegistrationId?: string;

  @IsOptional()
  @IsString()
  exemptionReference?: string;
}

export class CommercialContactDto {
  @IsIn(['BILLING', 'COMMERCIAL', 'PROCUREMENT', 'LEGAL', 'TECHNICAL'])
  type!: 'BILLING' | 'COMMERCIAL' | 'PROCUREMENT' | 'LEGAL' | 'TECHNICAL';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;
}

export class CreateCommercialAccountBindingDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  legalEntityId!: string;

  @IsOptional()
  @IsString()
  businessUnitId?: string;

  @IsString()
  @IsNotEmpty()
  environmentId!: string;

  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsString()
  @IsNotEmpty()
  residencyPolicy!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serviceScope!: string[];

  @IsOptional()
  @IsString()
  relationshipType?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}

export class CreateCommercialAccountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  customerLegalName!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CommercialBillingAddressDto)
  billingAddress!: CommercialBillingAddressDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CommercialTaxFactsDto)
  taxFacts!: CommercialTaxFactsDto;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommercialContactDto)
  contacts!: CommercialContactDto[];

  @IsIn(['DIRECT', 'ZOIKO_ONE_BUNDLE', 'RESELLER'])
  billingSource!: 'DIRECT' | 'ZOIKO_ONE_BUNDLE' | 'RESELLER';

  @IsOptional()
  @IsString()
  billingSourceReference?: string;

  @IsOptional()
  @IsIn(BILLING_CLASSIFICATIONS)
  billingClassification?: (typeof BILLING_CLASSIFICATIONS)[number];

  @IsOptional()
  @IsString()
  contractOwnerId?: string;

  @IsOptional()
  @IsString()
  processorCustomerRef?: string;

  @IsOptional()
  @IsString()
  groupAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCommercialAccountBindingDto)
  initialBinding?: CreateCommercialAccountBindingDto;
}

export class CreateGroupAccountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  customerLegalName!: string;
}

export class UpdateCommercialAccountBindingStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'ENDED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'ENDED';

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}

@Injectable()
export class CommercialAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async createCommercialAccount(
    dto: CreateCommercialAccountDto,
    actorId: string,
  ) {
    this.assertEffectiveWindow(dto.initialBinding);

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.groupAccountId) {
        const group = await tx.groupAccount.findFirst({
          where: { id: dto.groupAccountId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!group) {
          throw new NotFoundException(
            `Active group account '${dto.groupAccountId}' not found`,
          );
        }
      }
      const account = await tx.commercialAccount.create({
        data: {
          name: dto.name,
          customer_legal_name: dto.customerLegalName,
          billing_address: JSON.stringify(dto.billingAddress),
          tax_facts: JSON.stringify(dto.taxFacts),
          currency: dto.currency,
          contacts: JSON.stringify(dto.contacts),
          billing_source: dto.billingSource,
          billing_source_reference: dto.billingSourceReference,
          billing_classification:
            dto.billingClassification || 'COMMERCIAL_DIRECT',
          contract_owner_id: dto.contractOwnerId || actorId,
          processor_customer_ref: dto.processorCustomerRef,
          group_account_id: dto.groupAccountId,
          status: 'ACTIVE',
          // Compatibility mirrors only. Tenant scope is authorized exclusively
          // through CommercialAccountTenantBinding.
          legal_entity_id: dto.initialBinding?.legalEntityId,
          business_unit_id: dto.initialBinding?.businessUnitId,
          environment_id: dto.initialBinding?.environmentId,
          region: dto.initialBinding?.region || 'GLOBAL',
          residency_policy: dto.initialBinding?.residencyPolicy,
        },
      });

      const binding = dto.initialBinding
        ? await tx.commercialAccountTenantBinding.create({
            data: this.bindingData(account.id, dto.initialBinding),
          })
        : null;

      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_account.created',
          actor: actorId,
          tenant_id: dto.initialBinding?.tenantId,
          idempotency_key: randomUUID(),
          payload: JSON.stringify({
            commercialAccountId: account.id,
            billingSource: account.billing_source,
            billingClassification: account.billing_classification,
            bindingId: binding?.id,
          }),
        },
      });

      return { ...account, tenantBindings: binding ? [binding] : [] };
    });

    return this.deserializeAccount(result);
  }

  async createGroupAccount(dto: CreateGroupAccountDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.groupAccount.create({
        data: {
          name: dto.name,
          customer_legal_name: dto.customerLegalName,
          status: 'ACTIVE',
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_group_account.created',
          actor: actorId,
          idempotency_key: `commercial-group-account-created-${group.id}`,
          payload: JSON.stringify({ groupAccountId: group.id }),
        },
      });
      return group;
    });
  }

  async createBinding(
    commercialAccountId: string,
    dto: CreateCommercialAccountBindingDto,
    actorId: string,
  ) {
    this.assertEffectiveWindow(dto);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.commercialAccount.findUnique({
        where: { id: commercialAccountId },
      });
      if (!account) {
        throw new NotFoundException(
          `Commercial account '${commercialAccountId}' not found`,
        );
      }

      const existing = await tx.commercialAccountTenantBinding.findUnique({
        where: {
          commercial_account_id_tenant_id_environment_id: {
            commercial_account_id: commercialAccountId,
            tenant_id: dto.tenantId,
            environment_id: dto.environmentId,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          error: 'COMMERCIAL_ACCOUNT_BINDING_EXISTS',
          message: `Commercial account '${commercialAccountId}' is already bound to tenant '${dto.tenantId}' in environment '${dto.environmentId}'`,
        });
      }

      const binding = await tx.commercialAccountTenantBinding.create({
        data: this.bindingData(commercialAccountId, dto),
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_account.binding.created',
          actor: actorId,
          tenant_id: dto.tenantId,
          idempotency_key: randomUUID(),
          payload: JSON.stringify({
            commercialAccountId,
            bindingId: binding.id,
            environmentId: dto.environmentId,
            legalEntityId: dto.legalEntityId,
          }),
        },
      });
      return this.deserializeBinding(binding);
    });
  }

  async updateBindingStatus(
    commercialAccountId: string,
    bindingId: string,
    dto: UpdateCommercialAccountBindingStatusDto,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const binding = await tx.commercialAccountTenantBinding.findUnique({
        where: { id: bindingId },
      });
      if (!binding || binding.commercial_account_id !== commercialAccountId) {
        throw new NotFoundException(
          `Commercial account binding '${bindingId}' not found`,
        );
      }
      assertTransition(
        BINDING_TRANSITIONS,
        binding.status,
        dto.status,
        'commercial account binding',
      );

      const updated = await tx.commercialAccountTenantBinding.update({
        where: { id: bindingId },
        data: {
          status: dto.status,
          effective_to:
            dto.status === 'ENDED'
              ? dto.effectiveTo
                ? new Date(dto.effectiveTo)
                : new Date()
              : dto.effectiveTo
                ? new Date(dto.effectiveTo)
                : binding.effective_to,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_account.binding.status_changed',
          actor: actorId,
          tenant_id: binding.tenant_id,
          idempotency_key: randomUUID(),
          payload: JSON.stringify({
            commercialAccountId,
            bindingId,
            fromStatus: binding.status,
            toStatus: dto.status,
          }),
        },
      });
      return this.deserializeBinding(updated);
    });
  }

  async listCommercialAccountsForTenant(
    tenantId: string,
    environmentId?: string | null,
  ) {
    const accounts = await this.prisma.commercialAccount.findMany({
      where: {
        tenantBindings: {
          some: {
            tenant_id: tenantId,
            ...(environmentId ? { environment_id: environmentId } : {}),
          },
        },
      },
      include: {
        tenantBindings: {
          where: {
            tenant_id: tenantId,
            ...(environmentId ? { environment_id: environmentId } : {}),
          },
          orderBy: { created_at: 'desc' },
        },
        entitlements: { where: { tenant_id: tenantId } },
      },
      orderBy: { created_at: 'desc' },
    });
    return accounts.map((account) => this.deserializeAccount(account));
  }

  async getCommercialAccountForTenant(
    commercialAccountId: string,
    tenantId: string,
    environmentId?: string | null,
  ) {
    const account = await this.prisma.commercialAccount.findFirst({
      where: {
        id: commercialAccountId,
        tenantBindings: {
          some: {
            tenant_id: tenantId,
            ...(environmentId ? { environment_id: environmentId } : {}),
          },
        },
      },
      include: {
        tenantBindings: {
          where: {
            tenant_id: tenantId,
            ...(environmentId ? { environment_id: environmentId } : {}),
          },
          orderBy: { created_at: 'desc' },
        },
        entitlements: { where: { tenant_id: tenantId } },
      },
    });
    if (!account) {
      // Deliberately indistinguishable from absence to prevent account-ID
      // enumeration across customer tenants.
      throw new NotFoundException(
        `Commercial account '${commercialAccountId}' not found`,
      );
    }
    return this.deserializeAccount(account);
  }

  async getBindingsForTenant(
    commercialAccountId: string,
    tenantId: string,
    environmentId?: string | null,
  ) {
    await this.getCommercialAccountForTenant(
      commercialAccountId,
      tenantId,
      environmentId,
    );
    const bindings = await this.prisma.commercialAccountTenantBinding.findMany({
      where: {
        commercial_account_id: commercialAccountId,
        tenant_id: tenantId,
        ...(environmentId ? { environment_id: environmentId } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return bindings.map((binding) => this.deserializeBinding(binding));
  }

  /**
   * A group summary is a commercial-plane aggregation. It only contains
   * accounts and bindings independently visible to the current tenant and
   * environment; it never merges or returns another tenant's data-plane rows.
   */
  async getGroupSummaryForTenant(
    commercialAccountId: string,
    tenantId: string,
    environmentId?: string | null,
  ) {
    const now = new Date();
    const activeScope = {
      tenant_id: tenantId,
      ...(environmentId ? { environment_id: environmentId } : {}),
      status: 'ACTIVE',
      effective_from: { lte: now },
      OR: [{ effective_to: null }, { effective_to: { gt: now } }],
    };
    const visibleAccount = await this.prisma.commercialAccount.findFirst({
      where: {
        id: commercialAccountId,
        tenantBindings: {
          some: activeScope,
        },
      },
      select: { group_account_id: true },
    });
    if (!visibleAccount) {
      throw new NotFoundException(
        `Commercial account '${commercialAccountId}' not found`,
      );
    }
    if (!visibleAccount.group_account_id) {
      throw new NotFoundException(
        `Commercial account '${commercialAccountId}' has no group account`,
      );
    }

    const group = await this.prisma.groupAccount.findFirst({
      where: { id: visibleAccount.group_account_id, status: 'ACTIVE' },
      include: {
        commercialAccounts: {
          where: {
            tenantBindings: {
              some: activeScope,
            },
          },
          include: {
            tenantBindings: {
              where: activeScope,
            },
            entitlements: { where: { tenant_id: tenantId } },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('Active group account not found');
    }

    const accounts = group.commercialAccounts.map((account) =>
      this.deserializeAccount(account),
    );
    return {
      id: group.id,
      name: group.name,
      customer_legal_name: group.customer_legal_name,
      status: group.status,
      accountCount: accounts.length,
      currencies: [...new Set(accounts.map((account) => account.currency))],
      regions: [
        ...new Set(
          accounts.flatMap((account) =>
            account.tenantBindings.map((binding: any) => binding.region),
          ),
        ),
      ],
      commercialAccounts: accounts,
      created_at: group.created_at,
      updated_at: group.updated_at,
    };
  }

  private bindingData(
    commercialAccountId: string,
    dto: CreateCommercialAccountBindingDto,
  ) {
    return {
      commercial_account_id: commercialAccountId,
      tenant_id: dto.tenantId,
      legal_entity_id: dto.legalEntityId,
      business_unit_id: dto.businessUnitId,
      environment_id: dto.environmentId,
      region: dto.region,
      residency_policy: dto.residencyPolicy,
      service_scope: JSON.stringify(dto.serviceScope),
      relationship_type: dto.relationshipType || 'CUSTOMER',
      is_primary: dto.isPrimary ?? false,
      status: 'ACTIVE',
      effective_from: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : new Date(),
      effective_to: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
    };
  }

  private assertEffectiveWindow(dto?: CreateCommercialAccountBindingDto) {
    if (!dto?.effectiveTo) return;
    const from = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    if (new Date(dto.effectiveTo) <= from) {
      throw new BadRequestException(
        'Binding effectiveTo must be later than effectiveFrom',
      );
    }
  }

  private deserializeAccount<T extends Record<string, any>>(account: T) {
    return {
      ...account,
      billing_address: this.parseJson(account.billing_address, {}),
      tax_facts: this.parseJson(account.tax_facts, {}),
      contacts: this.parseJson(account.contacts, []),
      ...(Array.isArray(account.tenantBindings)
        ? {
            tenantBindings: account.tenantBindings.map((binding: any) =>
              this.deserializeBinding(binding),
            ),
          }
        : {}),
    };
  }

  private deserializeBinding<T extends Record<string, any>>(binding: T) {
    return {
      ...binding,
      service_scope: this.parseJson(binding.service_scope, []),
    };
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return (value as T) ?? fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
