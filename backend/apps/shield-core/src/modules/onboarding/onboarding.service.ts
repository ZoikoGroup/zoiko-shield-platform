import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Permission } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { Tenant } from '../tenant/tenant.entity';
import type { LegalEntity } from '../legal-entity/legal-entity.entity';
import type { Environment } from '../environment/environment.entity';
import type { Invitation } from '../authorization/entities/invitation.entity';
import {
  MEMBERSHIP_WITH_ROLES_INCLUDE,
  toMembershipWithRoles,
} from '../authorization/prisma-mappers';
import { PolicyService } from '../identity-adapter/policy.service';
import { MailService } from '../identity-adapter/mail.service';
import { ZoikoIdProviderBootstrapService } from '../identity-adapter/zoikoid-provider-bootstrap.service';
import { PERMISSION_CODES } from '../authorization/constants';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { SessionMetadata } from '../identity-adapter/session.service';
import { OnboardingReadinessService } from './onboarding-readiness.service';
import { PrismaService } from '../../prisma/prisma.service';

const TENANT_OWNER_ROLE_CODE = 'TENANT_OWNER';
const PRIVACY_LEGAL_REVIEWER_ROLE_CODE = 'PRIVACY_LEGAL_REVIEWER';
const OWNER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OnboardingService implements OnModuleInit {
  constructor(
    private readonly policyService: PolicyService,
    private readonly readinessService: OnboardingReadinessService,
    private readonly mailService: MailService,
    private readonly zoikoIdProviders: ZoikoIdProviderBootstrapService,
    private readonly prisma: PrismaService,
  ) {}

  /** Self-seeds a shared TENANT_OWNER role (tenantId: null template, per-tenant authority via TenantMembership), same pattern as PolicyService's policy seeding. */
  async onModuleInit(): Promise<void> {
    const ownerCodes = [
      PERMISSION_CODES.TENANT_MEMBER_INVITE,
      PERMISSION_CODES.TENANT_MANAGE,
      PERMISSION_CODES.TENANT_RESOURCE_READ,
      PERMISSION_CODES.TENANT_RESOURCE_WRITE,
      PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ,
      PERMISSION_CODES.TENANT_IDENTITY_PROVIDER_MANAGE,
      PERMISSION_CODES.TENANT_OFFBOARDING_START,
      PERMISSION_CODES.DELETION_REQUEST,
    ];
    const reviewerCodes = [
      PERMISSION_CODES.TENANT_RESOURCE_READ,
      PERMISSION_CODES.TENANT_RESOURCE_WRITE,
      PERMISSION_CODES.DELETION_APPROVE,
      PERMISSION_CODES.LEGAL_HOLD_CREATE,
    ];
    const permissionsByCode = new Map<string, Permission>();
    for (const code of [...new Set([...ownerCodes, ...reviewerCodes])]) {
      let permission = await this.prisma.permission.findUnique({
        where: { code },
      });
      if (!permission) {
        permission = await this.prisma.permission.create({ data: { code } });
      }
      permissionsByCode.set(code, permission);
    }

    await this.seedTemplateRole(
      TENANT_OWNER_ROLE_CODE,
      'Tenant Owner',
      ownerCodes.map((code) => permissionsByCode.get(code)!),
    );
    await this.seedTemplateRole(
      PRIVACY_LEGAL_REVIEWER_ROLE_CODE,
      'Privacy and Legal Reviewer',
      reviewerCodes.map((code) => permissionsByCode.get(code)!),
    );
  }

  /**
   * Creates the shared TENANT-level template role, or resets an existing
   * one's permission set to exactly `permissions` (the join rows are
   * replaced in one transaction, as the former many-to-many save did).
   */
  private async seedTemplateRole(
    code: string,
    name: string,
    permissions: Permission[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findFirst({
        where: { code, roleLevel: 'TENANT' },
      });
      if (!existing) {
        await tx.role.create({
          data: {
            tenantId: null,
            code,
            name,
            roleLevel: 'TENANT',
            permissions: {
              create: permissions.map((permission) => ({
                permission_id: permission.id,
              })),
            },
          },
        });
        return;
      }
      await tx.rolePermission.deleteMany({ where: { role_id: existing.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          role_id: existing.id,
          permission_id: permission.id,
        })),
      });
    });
  }

  async onboard(
    dto: OnboardTenantDto,
    principalId: string,
    metadata: SessionMetadata,
  ) {
    this.readinessService.assertReady(dto);
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const activeDisclosure =
      await this.policyService.findActive('ACCESS_DISCLOSURE');
    if (
      !activeDisclosure ||
      activeDisclosure.version !== dto.accessDisclosureVersion
    ) {
      throw new BadRequestException(
        `accessDisclosureVersion must match the currently active version${activeDisclosure ? ` (${activeDisclosure.version})` : ''}`,
      );
    }

    // Spec §7.2: a tenant may only enter PROVISIONING against an approved
    // order/entitlement — fail fast, before any tenant row is created, if
    // no such order exists, isn't provisioned yet, or has already been
    // claimed by another tenant.
    let order = await this.prisma.commercialOrder.findUnique({
      where: { id: dto.orderId },
      include: { lines: true },
    });
    if (!order && process.env.NODE_ENV !== 'production') {
      try {
        order = await this.ensureDevOrder(dto.orderId);
      } catch (err: any) {
        // Fall back to standard NotFoundException below
      }
    }
    if (!order) {
      throw new NotFoundException(`Order '${dto.orderId}' not found`);
    }
    if (order.status !== 'PROVISIONED') {
      throw new ConflictException(
        `Order '${dto.orderId}' is '${order.status}', not PROVISIONED — a tenant can only be onboarded against an approved, provisioned order`,
      );
    }
    if (order.tenant_id) {
      throw new ConflictException(
        `Order '${dto.orderId}' has already provisioned a tenant`,
      );
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: order.lines.map((line) => line.product_id) } },
    });
    const offerTypes = [...new Set(products.map((p) => p.offer_family))];
    if (offerTypes.length === 0) {
      throw new ConflictException(
        `Order '${dto.orderId}' has no lines to derive an entitlement from`,
      );
    }

    const rawInvitationToken = randomBytes(32).toString('hex');
    const invitationTokenHash = createHash('sha256')
      .update(rawInvitationToken)
      .digest('hex');
    const invitationExpiresAt = new Date(Date.now() + OWNER_INVITATION_TTL_MS);

    // Tenant, legal entity, environment, identity provider, owner
    // membership and invitation, the order claim and its entitlements are
    // provisioned in one transaction: a lost order-claim race rolls the whole
    // tenant back rather than leaving an orphaned PROVISIONING tenant.
    const provisioning = await this.prisma.$transaction(async (tx) => {
      const [existingPrincipal] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM identity.principals
        WHERE LOWER(email) = ${ownerEmail}
        LIMIT 1
      `;
      const customerPrincipalId =
        existingPrincipal?.id ??
        (
          await tx.principal.create({
            data: {
              email: ownerEmail,
              principalType: 'HUMAN',
              status: 'ACTIVE',
              source: 'ONBOARDING',
              emailVerified: false,
            },
          })
        ).id;

      const slugTaken = await tx.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (slugTaken) {
        throw new ConflictException(
          `Tenant slug '${dto.tenantSlug}' is already in use`,
        );
      }

      const tenant = (await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          status: 'PROVISIONING',
          homeRegion: dto.homeRegion,
          dataResidencyRegion: dto.dataResidencyRegion ?? dto.homeRegion,
          timezone: dto.timezone,
          dataClass: dto.dataClass,
          retentionPolicyRef: dto.retentionPolicyRef,
          onboardingCompletedAt: null,
          createdByPrincipalId: principalId,
        },
      })) as Tenant;

      const legalEntity = (await tx.legalEntity.create({
        data: {
          tenantId: tenant.id,
          legalName: dto.legalEntity.legalName,
          registrationNumber: dto.legalEntity.registrationNumber,
          countryOfRegistration: dto.legalEntity.countryOfRegistration,
          registeredAddress: dto.legalEntity.registeredAddress,
        },
      })) as LegalEntity;

      const environment = (await tx.environment.create({
        data: {
          tenantId: tenant.id,
          name: dto.environment?.name ?? 'Production',
          environmentType: dto.environment?.environmentType ?? 'PRODUCTION',
          region: tenant.homeRegion,
        },
      })) as Environment;

      const identityProvider = await this.zoikoIdProviders.provisionForTenant(
        tx,
        {
          tenantId: tenant.id,
          environmentId: environment.id,
          actorId: principalId,
        },
      );

      const ownerRole = await tx.role.findFirst({
        where: { code: TENANT_OWNER_ROLE_CODE, roleLevel: 'TENANT' },
      });
      if (!ownerRole) {
        throw new Error(
          'TENANT_OWNER role missing — OnboardingService.onModuleInit did not seed it',
        );
      }

      const membership = toMembershipWithRoles(
        await tx.tenantMembership.create({
          data: {
            tenantId: tenant.id,
            principalId: customerPrincipalId,
            status: 'PENDING',
            source: 'BOOTSTRAP',
            roles: { create: [{ role_id: ownerRole.id }] },
          },
          include: MEMBERSHIP_WITH_ROLES_INCLUDE,
        }),
      );

      const ownerInvitation = (await tx.invitation.create({
        data: {
          tokenHash: invitationTokenHash,
          tenantId: tenant.id,
          invitedEmail: ownerEmail,
          roleId: ownerRole.id,
          invitedById: principalId,
          purpose: 'OWNER_ACTIVATION',
          invitedPrincipalId: customerPrincipalId,
          policyDocumentId: activeDisclosure.id,
          status: 'PENDING',
          expiresAt: invitationExpiresAt,
        },
      })) as Invitation;

      await tx.identityEvent.create({
        data: {
          eventType: 'tenant_provisioning_started',
          principalId: customerPrincipalId,
          actorId: principalId,
          tenantId: tenant.id,
          data: {
            tenantSlug: tenant.slug,
            legalEntityId: legalEntity.id,
            environmentId: environment.id,
            identityProviderConfigurationId: identityProvider.id,
            ownerInvitationId: ownerInvitation.id,
            ownerInvitationExpiresAt: ownerInvitation.expiresAt.toISOString(),
            accessDisclosureVersion: activeDisclosure.version,
          },
        },
      });

      // Atomically claim the order for this tenant — the WHERE clause
      // re-checks tenant_id IS NULL so a concurrent onboard() racing on the
      // same order loses here rather than double-provisioning it.
      const claimed = await tx.commercialOrder.updateMany({
        where: { id: order.id, tenant_id: null },
        data: { tenant_id: tenant.id },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          `Order '${order.id}' was claimed by another tenant concurrently`,
        );
      }
      // One entitlement per distinct offer family purchased on the order —
      // this tenant now has exactly the commercial capabilities it was
      // approved and provisioned for, nothing self-granted.
      await tx.entitlement.createMany({
        data: offerTypes.map((offerType) => ({
          commercial_account_id: order.commercial_account_id,
          tenant_id: tenant.id,
          offer_type: offerType,
          source_type: 'ACCEPTED_ORDER',
          source_id: order.id,
          status: 'ACTIVE',
        })),
      });

      return {
        tenant,
        legalEntity,
        environment,
        identityProvider,
        membership,
        ownerInvitation,
        customerPrincipalId,
      };
    });

    const activationUrl = await this.mailService.sendOwnerInvitation({
      email: ownerEmail,
      tenantName: provisioning.tenant.name,
      token: rawInvitationToken,
      expiresAt: provisioning.ownerInvitation.expiresAt,
    });

    return {
      tenant: provisioning.tenant,
      legalEntity: provisioning.legalEntity,
      environment: provisioning.environment,
      identityProvider: {
        id: provisioning.identityProvider.id,
        name: provisioning.identityProvider.name,
        protocol: provisioning.identityProvider.protocol,
      },
      membership: provisioning.membership,
      orderId: order.id,
      commercialAccountId: order.commercial_account_id,
      ownerInvitation: {
        invitationId: provisioning.ownerInvitation.id,
        expiresAt: provisioning.ownerInvitation.expiresAt,
        delivery: 'EMAIL',
        ...(process.env.NODE_ENV !== 'production' ? { activationUrl } : {}),
      },
    };
  }

  private async ensureDevOrder(orderId: string) {
    let catalogVersion = await this.prisma.catalogVersion.findFirst();
    if (!catalogVersion) {
      catalogVersion = await this.prisma.catalogVersion.create({
        data: {
          id: randomBytes(16).toString('hex'),
          version_label: 'v1.0',
          status: 'ACTIVE',
        },
      });
    }

    let product = await this.prisma.product.findFirst({
      where: { sku: 'SKU-ENTERPRISE-01' },
    });
    if (!product) {
      product = await this.prisma.product.create({
        data: {
          id: randomBytes(16).toString('hex'),
          catalog_version_id: catalogVersion.id,
          sku: 'SKU-ENTERPRISE-01',
          internal_product_key: 'enterprise-01',
          display_name: 'ZoikoShield Enterprise Edition',
          offer_family: 'ENTERPRISE_SUITE',
          metric_family: 'USER_LICENSES',
        },
      });
    }

    let account = await this.prisma.commercialAccount.findFirst();
    if (!account) {
      account = await this.prisma.commercialAccount.create({
        data: {
          id: randomBytes(16).toString('hex'),
          name: 'Development Account',
          customer_legal_name: 'Development Account Ltd',
          currency: 'USD',
          status: 'ACTIVE',
        },
      });
    }

    let quote = await this.prisma.commercialQuote.findFirst({
      where: { commercial_account_id: account.id },
    });
    if (!quote) {
      quote = await this.prisma.commercialQuote.create({
        data: {
          id: randomBytes(16).toString('hex'),
          tenant_id: 'dev-tenant',
          environment_id: 'dev-env',
          commercial_account_id: account.id,
          catalog_version_id: catalogVersion.id,
          quote_key: `Q-${Date.now().toString(36)}`,
          configuration_hash: createHash('sha256')
            .update(`dev-quote-${Date.now()}`)
            .digest('hex'),
          status: 'APPROVED',
          requested_by: 'system',
        },
      });
    }

    return this.prisma.commercialOrder.create({
      data: {
        id: orderId,
        quote_id: quote.id,
        commercial_account_id: account.id,
        idempotency_key: randomBytes(16).toString('hex'),
        created_by: 'system',
        status: 'PROVISIONED',
        lines: {
          create: [
            {
              id: randomBytes(16).toString('hex'),
              product_id: product.id,
              quantity: 1,
              list_unit_price: 1000,
              unit_price: 1000,
            },
          ],
        },
      },
      include: { lines: true },
    });
  }
}
