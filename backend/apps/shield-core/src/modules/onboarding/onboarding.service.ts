import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
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

const TENANT_OWNER_ROLE_CODE = 'TENANT_OWNER';

@Injectable()
export class OnboardingService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policyService: PolicyService,
  ) {}

  /** Self-seeds a shared TENANT_OWNER role (tenantId: null template, per-tenant authority via TenantMembership), same pattern as PolicyService's policy seeding. */
  async onModuleInit(): Promise<void> {
    const permissionRepository = this.dataSource.getRepository(Permission);
    const roleRepository = this.dataSource.getRepository(Role);

    const codes = [PERMISSION_CODES.TENANT_MEMBER_INVITE, PERMISSION_CODES.TENANT_MANAGE];
    const permissions = [];
    for (const code of codes) {
      let permission = await permissionRepository.findOne({ where: { code } });
      if (!permission) {
        permission = await permissionRepository.save(permissionRepository.create({ code }));
      }
      permissions.push(permission);
    }

    const existing = await roleRepository.findOne({ where: { code: TENANT_OWNER_ROLE_CODE, roleLevel: 'TENANT' } });
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
    }
  }

  async onboard(dto: OnboardTenantDto, principalId: string, metadata: SessionMetadata) {
    const activeDisclosure = await this.policyService.findActive('ACCESS_DISCLOSURE');
    if (!activeDisclosure || activeDisclosure.version !== dto.accessDisclosureVersion) {
      throw new BadRequestException(
        `accessDisclosureVersion must match the currently active version${activeDisclosure ? ` (${activeDisclosure.version})` : ''}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const legalEntityRepo = manager.getRepository(LegalEntity);
      const environmentRepo = manager.getRepository(Environment);
      const membershipRepo = manager.getRepository(TenantMembership);
      const roleRepo = manager.getRepository(Role);
      const policyAcceptanceRepo = manager.getRepository(PolicyAcceptance);
      const eventRepo = manager.getRepository(IdentityEvent);

      const slugTaken = await tenantRepo.findOne({ where: { slug: dto.tenantSlug } });
      if (slugTaken) {
        throw new ConflictException(`Tenant slug '${dto.tenantSlug}' is already in use`);
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

      tenant.status = 'ACTIVE';
      tenant.onboardingCompletedAt = new Date();
      await tenantRepo.save(tenant);

      const ownerRole = await roleRepo.findOne({ where: { code: TENANT_OWNER_ROLE_CODE, roleLevel: 'TENANT' } });
      if (!ownerRole) {
        throw new Error('TENANT_OWNER role missing — OnboardingService.onModuleInit did not seed it');
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
          eventType: 'tenant_onboarded',
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
  }
}
