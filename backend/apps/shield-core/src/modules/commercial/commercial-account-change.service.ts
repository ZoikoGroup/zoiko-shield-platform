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
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import {
  CommercialBillingAddressDto,
  CommercialContactDto,
  CommercialTaxFactsDto,
} from './commercial-account.service';

export const COMMERCIAL_ACCOUNT_CHANGE_TYPES = [
  'ACCOUNT_PROFILE_CHANGE',
  'TENANT_BINDING_CHANGE',
  'PAYMENT_METHOD_CHANGE',
] as const;
type CommercialAccountChangeType =
  (typeof COMMERCIAL_ACCOUNT_CHANGE_TYPES)[number];

export class CommercialAccountProfileChangesDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerLegalName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommercialBillingAddressDto)
  billingAddress?: CommercialBillingAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommercialTaxFactsDto)
  taxFacts?: CommercialTaxFactsDto;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommercialContactDto)
  contacts?: CommercialContactDto[];

  @IsOptional()
  @IsString()
  billingSourceReference?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contractOwnerId?: string;

  @IsOptional()
  @IsString()
  processorCustomerRef?: string | null;

  /** Joining or leaving a group is material and only applied after approval. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  groupAccountId?: string | null;
}

export class CommercialAccountBindingChangesDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  legalEntityId?: string;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  region?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  residencyPolicy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceScope?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  relationshipType?: string;
}

export class ProposedPaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  provider!: string;

  /** Provider-issued token only. Raw PAN/CVC is never accepted or persisted. */
  @IsString()
  @IsNotEmpty()
  providerToken!: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @Matches(/^\d{4}$/)
  last4?: string;
}

export class RequestCommercialAccountChangeDto {
  @IsIn(COMMERCIAL_ACCOUNT_CHANGE_TYPES)
  changeType!: CommercialAccountChangeType;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  bindingId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommercialAccountProfileChangesDto)
  accountChanges?: CommercialAccountProfileChangesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommercialAccountBindingChangesDto)
  bindingChanges?: CommercialAccountBindingChangesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProposedPaymentMethodDto)
  paymentMethod?: ProposedPaymentMethodDto;
}

export class DecideCommercialAccountChangeDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@Injectable()
export class CommercialAccountChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  async requestChange(
    commercialAccountId: string,
    tenantId: string,
    environmentId: string | null,
    actorId: string,
    dto: RequestCommercialAccountChangeDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.commercialAccount.findFirst({
        where: {
          id: commercialAccountId,
          tenantBindings: {
            some: this.activeBindingScope(tenantId, environmentId),
          },
        },
      });
      if (!account) {
        throw new NotFoundException(
          `Commercial account '${commercialAccountId}' not found`,
        );
      }

      let beforeSnapshot: Record<string, unknown>;
      let proposedSnapshot: Record<string, unknown>;

      if (dto.changeType === 'ACCOUNT_PROFILE_CHANGE') {
        const changes = this.defined(dto.accountChanges);
        if (!Object.keys(changes).length) {
          throw new BadRequestException(
            'ACCOUNT_PROFILE_CHANGE requires at least one accountChanges field',
          );
        }
        if (typeof changes.groupAccountId === 'string') {
          const group = await tx.groupAccount.findFirst({
            where: { id: changes.groupAccountId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!group) {
            throw new NotFoundException(
              `Active group account '${changes.groupAccountId}' not found`,
            );
          }
        }
        beforeSnapshot = {
          accountUpdatedAt: account.updated_at.toISOString(),
          values: this.accountValues(account),
        };
        proposedSnapshot = {
          changeType: dto.changeType,
          accountId: commercialAccountId,
          tenantId,
          expectedAccountUpdatedAt: account.updated_at.toISOString(),
          changes,
        };
      } else if (dto.changeType === 'TENANT_BINDING_CHANGE') {
        if (!dto.bindingId) {
          throw new BadRequestException(
            'TENANT_BINDING_CHANGE requires bindingId',
          );
        }
        const changes = this.defined(dto.bindingChanges);
        if (!Object.keys(changes).length) {
          throw new BadRequestException(
            'TENANT_BINDING_CHANGE requires at least one bindingChanges field',
          );
        }
        if (
          Array.isArray(changes.serviceScope) &&
          changes.serviceScope.length === 0
        ) {
          throw new BadRequestException('serviceScope cannot be empty');
        }
        const binding = await tx.commercialAccountTenantBinding.findFirst({
          where: {
            id: dto.bindingId,
            commercial_account_id: commercialAccountId,
            ...this.activeBindingScope(tenantId, environmentId),
          },
        });
        if (!binding) {
          throw new NotFoundException(
            `Commercial account binding '${dto.bindingId}' not found`,
          );
        }
        beforeSnapshot = {
          bindingUpdatedAt: binding.updated_at.toISOString(),
          values: this.bindingValues(binding),
        };
        proposedSnapshot = {
          changeType: dto.changeType,
          accountId: commercialAccountId,
          tenantId,
          bindingId: binding.id,
          expectedBindingUpdatedAt: binding.updated_at.toISOString(),
          changes,
        };
      } else {
        if (!dto.paymentMethod) {
          throw new BadRequestException(
            'PAYMENT_METHOD_CHANGE requires paymentMethod',
          );
        }
        this.assertProviderToken(dto.paymentMethod.providerToken);
        const paymentMethod = await tx.paymentMethodReference.create({
          data: {
            commercial_account_id: commercialAccountId,
            provider: dto.paymentMethod.provider,
            provider_token: dto.paymentMethod.providerToken,
            brand: dto.paymentMethod.brand,
            last4: dto.paymentMethod.last4,
            status: 'PENDING_APPROVAL',
          },
        });
        beforeSnapshot = {
          accountUpdatedAt: account.updated_at.toISOString(),
          defaultPaymentMethodReferenceId:
            account.default_payment_method_reference_id,
        };
        // The provider token deliberately stays only on the restricted
        // PaymentMethodReference row, never in approval/event payloads.
        proposedSnapshot = {
          changeType: dto.changeType,
          accountId: commercialAccountId,
          tenantId,
          expectedAccountUpdatedAt: account.updated_at.toISOString(),
          paymentMethodReferenceId: paymentMethod.id,
          provider: paymentMethod.provider,
          brand: paymentMethod.brand,
          last4: paymentMethod.last4,
        };
      }

      const approval = await this.approvalService.requestApproval(
        {
          changeType: dto.changeType,
          objectType: 'CommercialAccount',
          objectId: commercialAccountId,
          tenantId,
          requestedBy: actorId,
          reason: dto.reason,
          beforeSnapshot,
          proposedSnapshot,
          requiredApprovalRole: 'COMMERCIAL_ACCOUNT_OWNER',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        tx,
      );
      return this.approvalView(approval);
    });
  }

  async listChanges(
    commercialAccountId: string,
    tenantId: string,
    environmentId: string | null,
  ) {
    await this.assertActiveAccountScope(
      commercialAccountId,
      tenantId,
      environmentId,
    );
    const approvals = await this.prisma.commercialApproval.findMany({
      where: {
        object_type: 'CommercialAccount',
        object_id: commercialAccountId,
        tenant_id: tenantId,
        change_type: { in: [...COMMERCIAL_ACCOUNT_CHANGE_TYPES] },
      },
      orderBy: { requested_at: 'desc' },
    });
    return approvals.map((approval) => this.approvalView(approval));
  }

  async decideChange(
    commercialAccountId: string,
    approvalId: string,
    tenantId: string,
    environmentId: string | null,
    approverId: string,
    dto: DecideCommercialAccountChangeDto,
  ) {
    await this.assertActiveAccountScope(
      commercialAccountId,
      tenantId,
      environmentId,
    );
    const approval = await this.getScopedApproval(
      commercialAccountId,
      approvalId,
      tenantId,
    );
    const decided = await this.approvalService.decideApproval(
      approval.id,
      approverId,
      dto.decision,
      dto.reason,
    );

    if (
      dto.decision === 'REJECTED' &&
      approval.change_type === 'PAYMENT_METHOD_CHANGE'
    ) {
      const proposed = this.parseSnapshot(approval.proposed_snapshot);
      if (typeof proposed.paymentMethodReferenceId === 'string') {
        await this.prisma.paymentMethodReference.updateMany({
          where: {
            id: proposed.paymentMethodReferenceId,
            commercial_account_id: commercialAccountId,
            status: 'PENDING_APPROVAL',
          },
          data: { status: 'REJECTED' },
        });
      }
    }
    return this.approvalView(decided);
  }

  async applyChange(
    commercialAccountId: string,
    approvalId: string,
    tenantId: string,
    environmentId: string | null,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.commercialApproval.findFirst({
        where: {
          id: approvalId,
          object_type: 'CommercialAccount',
          object_id: commercialAccountId,
          tenant_id: tenantId,
        },
      });
      if (!approval) {
        throw new NotFoundException(
          `Commercial account change '${approvalId}' not found`,
        );
      }
      if (approval.status !== 'APPROVED') {
        throw new ConflictException({
          statusCode: 409,
          error: 'COMMERCIAL_CHANGE_NOT_APPROVED',
          message: `Commercial account change '${approvalId}' is '${approval.status}', not APPROVED`,
        });
      }

      const visibleBinding = await tx.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: commercialAccountId,
          ...this.activeBindingScope(tenantId, environmentId),
        },
      });
      if (!visibleBinding) {
        throw new NotFoundException(
          `Commercial account '${commercialAccountId}' not found`,
        );
      }

      const proposed = this.parseSnapshot(approval.proposed_snapshot);
      let resource: Record<string, unknown>;
      if (approval.change_type === 'ACCOUNT_PROFILE_CHANGE') {
        const account = await tx.commercialAccount.findUnique({
          where: { id: commercialAccountId },
        });
        if (!account)
          throw new NotFoundException('Commercial account not found');
        this.assertVersion(
          account.updated_at,
          proposed.expectedAccountUpdatedAt,
          'commercial account',
        );
        const changes = this.objectValue(proposed.changes);
        if (typeof changes.groupAccountId === 'string') {
          const group = await tx.groupAccount.findFirst({
            where: { id: changes.groupAccountId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!group) {
            throw new ConflictException(
              'The approved group account is no longer active',
            );
          }
        }
        const updateData = this.accountUpdateData(changes);
        const update = await tx.commercialAccount.updateMany({
          where: {
            id: commercialAccountId,
            updated_at: account.updated_at,
          },
          data: updateData,
        });
        this.assertUpdated(update.count, 'commercial account');
        resource = { ...account, ...updateData };
      } else if (approval.change_type === 'TENANT_BINDING_CHANGE') {
        if (typeof proposed.bindingId !== 'string') {
          throw new ConflictException('Approval has no binding reference');
        }
        const binding = await tx.commercialAccountTenantBinding.findFirst({
          where: {
            id: proposed.bindingId,
            commercial_account_id: commercialAccountId,
            ...this.activeBindingScope(tenantId, environmentId),
          },
        });
        if (!binding) {
          throw new NotFoundException('Commercial account binding not found');
        }
        this.assertVersion(
          binding.updated_at,
          proposed.expectedBindingUpdatedAt,
          'commercial account binding',
        );
        const updateData = this.bindingUpdateData(
          this.objectValue(proposed.changes),
        );
        const update = await tx.commercialAccountTenantBinding.updateMany({
          where: { id: binding.id, updated_at: binding.updated_at },
          data: updateData,
        });
        this.assertUpdated(update.count, 'commercial account binding');
        resource = { ...binding, ...updateData };
      } else if (approval.change_type === 'PAYMENT_METHOD_CHANGE') {
        const account = await tx.commercialAccount.findUnique({
          where: { id: commercialAccountId },
        });
        if (!account)
          throw new NotFoundException('Commercial account not found');
        this.assertVersion(
          account.updated_at,
          proposed.expectedAccountUpdatedAt,
          'commercial account',
        );
        if (typeof proposed.paymentMethodReferenceId !== 'string') {
          throw new ConflictException(
            'Approval has no payment-method reference',
          );
        }
        const paymentMethod = await tx.paymentMethodReference.findFirst({
          where: {
            id: proposed.paymentMethodReferenceId,
            commercial_account_id: commercialAccountId,
            status: 'PENDING_APPROVAL',
          },
        });
        if (!paymentMethod) {
          throw new ConflictException(
            'Pending payment-method reference is unavailable',
          );
        }
        if (account.default_payment_method_reference_id) {
          await tx.paymentMethodReference.updateMany({
            where: {
              id: account.default_payment_method_reference_id,
              commercial_account_id: commercialAccountId,
              status: 'ACTIVE',
            },
            data: { status: 'REPLACED' },
          });
        }
        const accountUpdate = await tx.commercialAccount.updateMany({
          where: {
            id: commercialAccountId,
            updated_at: account.updated_at,
          },
          data: {
            default_payment_method_reference_id: paymentMethod.id,
          },
        });
        this.assertUpdated(accountUpdate.count, 'commercial account');
        await tx.paymentMethodReference.update({
          where: { id: paymentMethod.id },
          data: { status: 'ACTIVE' },
        });
        resource = {
          ...account,
          default_payment_method_reference_id: paymentMethod.id,
        };
      } else {
        throw new ConflictException(
          `Unsupported commercial account change type '${approval.change_type}'`,
        );
      }

      const appliedApproval = await tx.commercialApproval.update({
        where: { id: approvalId },
        data: { status: 'APPLIED', applied_at: new Date() },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_account.change.applied',
          tenant_id: tenantId,
          actor: actorId,
          idempotency_key: `commercial-account-change-applied-${approvalId}`,
          payload: JSON.stringify({
            approvalId,
            commercialAccountId,
            changeType: approval.change_type,
            changedFields: this.changedFields(proposed),
          }),
        },
      });
      return {
        approval: this.approvalView(appliedApproval),
        resource: this.publicResource(resource),
      };
    });
  }

  private async assertActiveAccountScope(
    commercialAccountId: string,
    tenantId: string,
    environmentId: string | null,
  ) {
    const binding = await this.prisma.commercialAccountTenantBinding.findFirst({
      where: {
        commercial_account_id: commercialAccountId,
        ...this.activeBindingScope(tenantId, environmentId),
      },
    });
    if (!binding) {
      throw new NotFoundException(
        `Commercial account '${commercialAccountId}' not found`,
      );
    }
  }

  private getScopedApproval(
    commercialAccountId: string,
    approvalId: string,
    tenantId: string,
  ) {
    return this.prisma.commercialApproval
      .findFirst({
        where: {
          id: approvalId,
          object_type: 'CommercialAccount',
          object_id: commercialAccountId,
          tenant_id: tenantId,
        },
      })
      .then((approval) => {
        if (!approval) {
          throw new NotFoundException(
            `Commercial account change '${approvalId}' not found`,
          );
        }
        return approval;
      });
  }

  private activeBindingScope(tenantId: string, environmentId: string | null) {
    const now = new Date();
    return {
      tenant_id: tenantId,
      ...(environmentId ? { environment_id: environmentId } : {}),
      status: 'ACTIVE',
      effective_from: { lte: now },
      OR: [{ effective_to: null }, { effective_to: { gte: now } }],
    };
  }

  private accountValues(account: Record<string, unknown>) {
    return {
      customerLegalName: account.customer_legal_name,
      billingAddress: this.parseValue(account.billing_address, {}),
      taxFacts: this.parseValue(account.tax_facts, {}),
      currency: account.currency,
      contacts: this.parseValue(account.contacts, []),
      billingSourceReference: account.billing_source_reference,
      contractOwnerId: account.contract_owner_id,
      processorCustomerRef: account.processor_customer_ref,
      groupAccountId: account.group_account_id,
    };
  }

  private bindingValues(binding: Record<string, unknown>) {
    return {
      legalEntityId: binding.legal_entity_id,
      businessUnitId: binding.business_unit_id,
      region: binding.region,
      residencyPolicy: binding.residency_policy,
      serviceScope: this.parseValue(binding.service_scope, []),
      relationshipType: binding.relationship_type,
    };
  }

  private accountUpdateData(changes: Record<string, unknown>) {
    return {
      ...(typeof changes.customerLegalName === 'string'
        ? { customer_legal_name: changes.customerLegalName }
        : {}),
      ...(changes.billingAddress
        ? { billing_address: JSON.stringify(changes.billingAddress) }
        : {}),
      ...(changes.taxFacts
        ? { tax_facts: JSON.stringify(changes.taxFacts) }
        : {}),
      ...(typeof changes.currency === 'string'
        ? { currency: changes.currency }
        : {}),
      ...(Array.isArray(changes.contacts)
        ? { contacts: JSON.stringify(changes.contacts) }
        : {}),
      ...('billingSourceReference' in changes
        ? {
            billing_source_reference: changes.billingSourceReference as
              string | null,
          }
        : {}),
      ...(typeof changes.contractOwnerId === 'string'
        ? { contract_owner_id: changes.contractOwnerId }
        : {}),
      ...('processorCustomerRef' in changes
        ? {
            processor_customer_ref: changes.processorCustomerRef as
              string | null,
          }
        : {}),
      ...('groupAccountId' in changes
        ? { group_account_id: changes.groupAccountId as string | null }
        : {}),
    };
  }

  private bindingUpdateData(changes: Record<string, unknown>) {
    return {
      ...(typeof changes.legalEntityId === 'string'
        ? { legal_entity_id: changes.legalEntityId }
        : {}),
      ...('businessUnitId' in changes
        ? { business_unit_id: changes.businessUnitId as string | null }
        : {}),
      ...(typeof changes.region === 'string' ? { region: changes.region } : {}),
      ...(typeof changes.residencyPolicy === 'string'
        ? { residency_policy: changes.residencyPolicy }
        : {}),
      ...(Array.isArray(changes.serviceScope)
        ? { service_scope: JSON.stringify(changes.serviceScope) }
        : {}),
      ...(typeof changes.relationshipType === 'string'
        ? { relationship_type: changes.relationshipType }
        : {}),
    };
  }

  private assertVersion(actual: Date, expected: unknown, resource: string) {
    if (typeof expected !== 'string' || actual.toISOString() !== expected) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_CHANGE_STALE',
        message: `The ${resource} changed after this approval was requested; request a fresh approval`,
      });
    }
  }

  private assertUpdated(count: number, resource: string) {
    if (count !== 1) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_CHANGE_STALE',
        message: `The ${resource} changed while this approval was being applied; request a fresh approval`,
      });
    }
  }

  private assertProviderToken(token: string) {
    if (/^\d{12,19}$/.test(token.replace(/[ -]/g, ''))) {
      throw new BadRequestException(
        'Raw card numbers are prohibited; provide a processor-issued token',
      );
    }
  }

  private changedFields(proposed: Record<string, unknown>): string[] {
    if (proposed.changes && typeof proposed.changes === 'object') {
      return Object.keys(proposed.changes);
    }
    return proposed.changeType === 'PAYMENT_METHOD_CHANGE'
      ? ['defaultPaymentMethodReferenceId']
      : [];
  }

  private approvalView<T extends Record<string, unknown>>(approval: T) {
    return {
      ...approval,
      before_snapshot: this.parseValue(approval.before_snapshot, {}),
      proposed_snapshot: this.parseValue(approval.proposed_snapshot, {}),
    };
  }

  private publicResource(resource: Record<string, unknown>) {
    const safe = { ...resource };
    delete safe.provider_token;
    return safe;
  }

  private parseSnapshot(value: unknown): Record<string, unknown> {
    const parsed = this.parseValue(value, {});
    return this.objectValue(parsed);
  }

  private parseValue<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return (value as T) ?? fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private defined(value?: object): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value ?? {}).filter(([, item]) => item !== undefined),
    );
  }
}
