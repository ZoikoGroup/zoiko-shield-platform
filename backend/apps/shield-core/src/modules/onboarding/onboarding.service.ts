import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { LegalEntity } from '../legal-entity/legal-entity.entity';
import { Environment } from '../environment/environment.entity';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { Role } from '../authorization/entities/role.entity';
import { Permission } from '../authorization/entities/permission.entity';
import { PolicyAcceptance } from '../identity-adapter/policy-acceptance.entity';
import { IdentityEvent } from '../identity-adapter/identity-event.entity';
import { PolicyService } from '../identity-adapter/policy.service';
import { PERMISSION_CODES } from '../authorization/constants';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { SessionMetadata } from '../identity-adapter/session.service';
import { OnboardingReadinessService } from './onboarding-readiness.service';
import { EvidenceService } from '../evidence/services/evidence.service';
import { PrismaService } from '../../prisma/prisma.service';

const TENANT_OWNER_ROLE_CODE = 'TENANT_OWNER';

@Injectable()
export class OnboardingService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policyService: PolicyService,
    private readonly readinessService: OnboardingReadinessService,
    private readonly evidenceService: EvidenceService,
    private readonly prisma: PrismaService,
  ) {}

  /** Self-seeds a shared TENANT_OWNER role (tenantId: null template, per-tenant authority via TenantMembership), same pattern as PolicyService's policy seeding. */
  async onModuleInit(): Promise<void> {
    const permissionRepository = this.dataSource.getRepository(Permission);
    const roleRepository = this.dataSource.getRepository(Role);

    const codes = [
      PERMISSION_CODES.TENANT_MEMBER_INVITE,
      PERMISSION_CODES.TENANT_MANAGE,
      PERMISSION_CODES.TENANT_OFFBOARDING_START,
      PERMISSION_CODES.DELETION_REQUEST,
      PERMISSION_CODES.LEGAL_HOLD_CREATE,
    ];
    const permissions = [];
    for (const code of codes) {
      let permission = await permissionRepository.findOne({ where: { code } });
      if (!permission) {
        permission = await permissionRepository.save(
          permissionRepository.create({ code }),
        );
      }
      permissions.push(permission);
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
          permissions,
        }),
      );
    } else {
      existing.permissions = permissions;
      await roleRepository.save(existing);
    }
  }

  async onboard(
    dto: OnboardTenantDto,
    principalId: string,
    metadata: SessionMetadata,
  ) {
    this.readinessService.assertReady(dto);
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

    const provisioning = await this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const legalEntityRepo = manager.getRepository(LegalEntity);
      const environmentRepo = manager.getRepository(Environment);
      const membershipRepo = manager.getRepository(TenantMembership);
      const roleRepo = manager.getRepository(Role);
      const policyAcceptanceRepo = manager.getRepository(PolicyAcceptance);
      const eventRepo = manager.getRepository(IdentityEvent);

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
          principalId,
          status: 'ACTIVE',
          source: 'BOOTSTRAP',
          roles: [ownerRole],
        }),
      );

      await policyAcceptanceRepo.save(
        policyAcceptanceRepo.create({
          principalId,
          policyDocumentId: activeDisclosure.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        }),
      );

      await eventRepo.save(
        eventRepo.create({
          eventType: 'tenant_provisioning_started',
          principalId,
          actorId: principalId,
          tenantId: tenant.id,
          data: {
            tenantSlug: tenant.slug,
            legalEntityId: legalEntity.id,
            environmentId: environment.id,
            accessDisclosureVersion: activeDisclosure.version,
          },
        }),
      );

      return { tenant, legalEntity, environment, membership };
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
          status: 'ACTIVE',
        })),
      });
    });

    const acceptanceEvidence = await this.evidenceService.createEvidence({
      tenantId: provisioning.tenant.id,
      environmentId: provisioning.environment.id,
      legalEntityId: provisioning.legalEntity.id,
      region: provisioning.tenant.dataResidencyRegion,
      evidenceType: 'POLICY_ACCEPTANCE',
      producingService: 'shield-core',
      sourceSystemId: 'identity-adapter',
      sourceObjectId: activeDisclosure.id,
      purpose: 'TENANT_ONBOARDING',
      dataClass: provisioning.tenant.dataClass,
      retentionProfile: provisioning.tenant.retentionPolicyRef,
      content: {
        tenantId: provisioning.tenant.id,
        principalId,
        policyDocumentId: activeDisclosure.id,
        policyVersion: activeDisclosure.version,
        policyContentHash: activeDisclosure.contentHash,
        acceptedAt: new Date().toISOString(),
      },
    });

    const tenant = await this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const eventRepo = manager.getRepository(IdentityEvent);
      const current = await tenantRepo.findOneByOrFail({
        id: provisioning.tenant.id,
      });
      current.status = 'ACTIVE';
      current.onboardingCompletedAt = new Date();
      const activated = await tenantRepo.save(current);
      await eventRepo.save(
        eventRepo.create({
          eventType: 'tenant_onboarded',
          principalId,
          actorId: principalId,
          tenantId: activated.id,
          data: {
            legalEntityId: provisioning.legalEntity.id,
            environmentId: provisioning.environment.id,
            orderId: order.id,
            commercialAccountId: order.commercial_account_id,
            acceptanceEvidenceId: acceptanceEvidence.id,
            accessDisclosureVersion: activeDisclosure.version,
          },
        }),
      );
      return activated;
    });

    return {
      tenant,
      legalEntity: provisioning.legalEntity,
      environment: provisioning.environment,
      membership: provisioning.membership,
      orderId: order.id,
      commercialAccountId: order.commercial_account_id,
      acceptanceEvidenceId: acceptanceEvidence.id,
    };
  }
}
