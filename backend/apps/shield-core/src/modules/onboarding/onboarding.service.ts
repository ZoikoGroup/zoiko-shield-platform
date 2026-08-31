import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Raw } from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { LegalEntity } from '../legal-entity/legal-entity.entity';
import { Environment } from '../environment/environment.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { Role } from '../authorization/entities/role.entity';
import { Permission } from '../authorization/entities/permission.entity';
import { Principal } from '../identity-adapter/principal.entity';
import { IdentityEvent } from '../identity-adapter/identity-event.entity';
import { PolicyService } from '../identity-adapter/policy.service';
import { MailService } from '../identity-adapter/mail.service';
import { ZoikoIdProviderBootstrapService } from '../identity-adapter/zoikoid-provider-bootstrap.service';
import { PERMISSION_CODES } from '../authorization/constants';
import { Invitation } from '../authorization/entities/invitation.entity';
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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policyService: PolicyService,
    private readonly readinessService: OnboardingReadinessService,
    private readonly mailService: MailService,
    private readonly zoikoIdProviders: ZoikoIdProviderBootstrapService,
    private readonly prisma: PrismaService,
  ) {}

  /** Self-seeds a shared TENANT_OWNER role (tenantId: null template, per-tenant authority via TenantMembership), same pattern as PolicyService's policy seeding. */
  async onModuleInit(): Promise<void> {
    const permissionRepository = this.dataSource.getRepository(Permission);
    const roleRepository = this.dataSource.getRepository(Role);

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
      let permission = await permissionRepository.findOne({ where: { code } });
      if (!permission) {
        permission = await permissionRepository.save(
          permissionRepository.create({ code }),
        );
      }
      permissionsByCode.set(code, permission);
    }

    const existing = await roleRepository.findOne({
      where: { code: TENANT_OWNER_ROLE_CODE, roleLevel: 'TENANT' },
    });
    if (!existing) {
      await roleRepository.save(
        roleRepository.create({
          tenantId: null,
          code: TENANT_OWNER_ROLE_CODE,
          name: 'Tenant Owner',
          roleLevel: 'TENANT',
          permissions: ownerCodes.map((code) => permissionsByCode.get(code)!),
        }),
      );
    } else {
      existing.permissions = ownerCodes.map((code) =>
        permissionsByCode.get(code)!,
      );
      await roleRepository.save(existing);
    }

    const reviewer = await roleRepository.findOne({
      where: {
        code: PRIVACY_LEGAL_REVIEWER_ROLE_CODE,
        roleLevel: 'TENANT',
      },
    });
    const reviewerPermissions = reviewerCodes.map((code) =>
      permissionsByCode.get(code)!,
    );
    if (!reviewer) {
      await roleRepository.save(
        roleRepository.create({
          tenantId: null,
          code: PRIVACY_LEGAL_REVIEWER_ROLE_CODE,
          name: 'Privacy and Legal Reviewer',
          roleLevel: 'TENANT',
          permissions: reviewerPermissions,
        }),
      );
    } else {
      reviewer.permissions = reviewerPermissions;
      await roleRepository.save(reviewer);
    }
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
    const order = await this.prisma.commercialOrder.findUnique({
      where: { id: dto.orderId },
      include: { lines: true },
    });
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

    const provisioning = await this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const legalEntityRepo = manager.getRepository(LegalEntity);
      const environmentRepo = manager.getRepository(Environment);
      const membershipRepo = manager.getRepository(TenantMembership);
      const invitationRepo = manager.getRepository(Invitation);
      const roleRepo = manager.getRepository(Role);
      const eventRepo = manager.getRepository(IdentityEvent);
      const principalRepo = manager.getRepository(Principal);

      let customerPrincipal = await principalRepo.findOne({
        where: {
          email: Raw((column) => `LOWER(${column}) = :ownerEmail`, {
            ownerEmail,
          }),
        },
      });
      if (!customerPrincipal) {
        customerPrincipal = await principalRepo.save(
          principalRepo.create({
            email: ownerEmail,
            principalType: 'HUMAN',
            status: 'ACTIVE',
            source: 'ONBOARDING',
            emailVerified: false,
          }),
        );
      }

      const slugTaken = await tenantRepo.findOne({
        where: { slug: dto.tenantSlug },
      });
      if (slugTaken) {
        throw new ConflictException(
          `Tenant slug '${dto.tenantSlug}' is already in use`,
        );
      }

      const tenant = await tenantRepo.save(
        tenantRepo.create({
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
        }),
      );

      const legalEntity = await legalEntityRepo.save(
        legalEntityRepo.create({ tenantId: tenant.id, ...dto.legalEntity }),
      );

      const environment = await environmentRepo.save(
        environmentRepo.create({
          tenantId: tenant.id,
          name: dto.environment?.name ?? 'Production',
          environmentType: dto.environment?.environmentType ?? 'PRODUCTION',
          region: tenant.homeRegion,
        }),
      );

      const identityProvider = await this.zoikoIdProviders.provisionForTenant(
        manager,
        {
          tenantId: tenant.id,
          environmentId: environment.id,
          actorId: principalId,
        },
      );

      const ownerRole = await roleRepo.findOne({
        where: { code: TENANT_OWNER_ROLE_CODE, roleLevel: 'TENANT' },
      });
      if (!ownerRole) {
        throw new Error(
          'TENANT_OWNER role missing — OnboardingService.onModuleInit did not seed it',
        );
      }

      const membership = await membershipRepo.save(
        membershipRepo.create({
          tenantId: tenant.id,
          principalId: customerPrincipal.id,
          status: 'PENDING',
          source: 'BOOTSTRAP',
          roles: [ownerRole],
        }),
      );

      const ownerInvitation = await invitationRepo.save(
        invitationRepo.create({
          tokenHash: invitationTokenHash,
          tenantId: tenant.id,
          invitedEmail: ownerEmail,
          roleId: ownerRole.id,
          invitedById: principalId,
          purpose: 'OWNER_ACTIVATION',
          invitedPrincipalId: customerPrincipal.id,
          policyDocumentId: activeDisclosure.id,
          status: 'PENDING',
          expiresAt: invitationExpiresAt,
        }),
      );

      await eventRepo.save(
        eventRepo.create({
          eventType: 'tenant_provisioning_started',
          principalId: customerPrincipal.id,
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
        }),
      );

      return {
        tenant,
        legalEntity,
        environment,
        identityProvider,
        membership,
        ownerInvitation,
        customerPrincipalId: customerPrincipal.id,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      // Atomically claim the order for this tenant — the WHERE clause
      // re-checks tenant_id IS NULL so a concurrent onboard() racing on the
      // same order loses here rather than double-provisioning it.
      const claimed = await tx.commercialOrder.updateMany({
        where: { id: order.id, tenant_id: null },
        data: { tenant_id: provisioning.tenant.id },
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
          tenant_id: provisioning.tenant.id,
          offer_type: offerType,
          source_type: 'ACCEPTED_ORDER',
          source_id: order.id,
          status: 'ACTIVE',
        })),
      });
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
}
