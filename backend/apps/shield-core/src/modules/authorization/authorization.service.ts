import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Permission } from './entities/permission.entity';
import type {
  Role,
  RoleLevel,
  RoleWithPermissions,
} from './entities/role.entity';
import type {
  TenantMembershipWithPermissions,
  TenantMembershipWithRoles,
} from './entities/tenant-membership.entity';
import type { Invitation } from './entities/invitation.entity';
import {
  MEMBERSHIP_WITH_PERMISSIONS_INCLUDE,
  MEMBERSHIP_WITH_ROLES_INCLUDE,
  ROLE_WITH_PERMISSIONS_INCLUDE,
  toMembershipWithPermissions,
  toMembershipWithRoles,
  toRole,
  toRoleWithPermissions,
} from './prisma-mappers';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async createPermission(
    code: string,
    description?: string,
  ): Promise<Permission> {
    const existing = await this.prisma.permission.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(`Permission ${code} already exists`);
    }
    return this.prisma.permission.create({ data: { code, description } });
  }

  async createRole(data: {
    tenantId: string | null;
    code: string;
    name: string;
    roleLevel: RoleLevel;
    permissionCodes?: string[];
  }): Promise<RoleWithPermissions> {
    const permissions = data.permissionCodes?.length
      ? await this.prisma.permission.findMany({
          where: { code: { in: data.permissionCodes } },
        })
      : [];
    const role = await this.prisma.role.create({
      data: {
        tenantId: data.tenantId,
        code: data.code,
        name: data.name,
        roleLevel: data.roleLevel,
        permissions: {
          create: permissions.map((permission) => ({
            permission_id: permission.id,
          })),
        },
      },
      include: ROLE_WITH_PERMISSIONS_INCLUDE,
    });
    return toRoleWithPermissions(role);
  }

  async findRoles(tenantId?: string): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      where: tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : undefined,
      include: ROLE_WITH_PERMISSIONS_INCLUDE,
    });
    return roles.map(toRoleWithPermissions);
  }

  async updateRolePermissions(
    roleId: string,
    permissionCodes: string[],
  ): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    // Replace the role's permission set in one transaction, as the former
    // many-to-many save did: drop the join rows, then insert the new set.
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role_id: role.id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            role_id: role.id,
            permission_id: permission.id,
          })),
        });
      }
    });
    return { ...toRole(role), permissions };
  }

  async getPermissionCodesForPrincipal(
    tenantId: string,
    principalId: string,
  ): Promise<string[]> {
    const codes = new Set<string>();

    // Check tenant-specific membership
    const membership = await this.getMembershipForPrincipal(
      tenantId,
      principalId,
    );
    if (membership) {
      for (const role of membership.roles) {
        for (const permission of role.permissions) {
          codes.add(permission.code);
        }
      }
    }

    return [...codes];
  }

  async hasTenantAccess(
    tenantId: string,
    principalId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, principalId, status: 'ACTIVE' },
      select: { id: true },
    });
    return Boolean(membership);
  }

  async getAccessibleTenantIds(principalId: string): Promise<string[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { principalId, status: 'ACTIVE' },
      select: { tenantId: true },
    });
    return memberships
      .map((membership) => membership.tenantId)
      .filter(
        (tenantId) => tenantId !== '00000000-0000-0000-0000-000000000000',
      );
  }

  /** Returns all active memberships for a principal, with roles and permissions eagerly loaded. */
  async getMembershipsForPrincipal(
    principalId: string,
  ): Promise<TenantMembershipWithPermissions[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { principalId, status: 'ACTIVE' },
      include: MEMBERSHIP_WITH_PERMISSIONS_INCLUDE,
    });
    return memberships.map(toMembershipWithPermissions);
  }

  async getMembershipForPrincipal(
    tenantId: string,
    principalId: string,
  ): Promise<TenantMembershipWithPermissions | null> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, principalId, status: 'ACTIVE' },
      include: MEMBERSHIP_WITH_PERMISSIONS_INCLUDE,
    });
    return membership ? toMembershipWithPermissions(membership) : null;
  }

  // ── Invitations ──────────────────────────────────────────────
  // Replaces self-assigned tenant membership: only an inviter holding
  // member:invite may create an invitation, and the accepting principal
  // never chooses their own tenant/role — both come from the token.

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createInvitation(data: {
    tenantId: string;
    invitedEmail: string;
    roleId: string;
    invitedById: string;
  }): Promise<{ invitation: Invitation; token: string }> {
    const role = await this.prisma.role.findUnique({
      where: { id: data.roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${data.roleId} not found`);
    }
    if (role.roleLevel === 'PLATFORM') {
      throw new ForbiddenException(
        'Cannot invite a member with a PLATFORM-level role',
      );
    }
    if (role.tenantId && role.tenantId !== data.tenantId) {
      throw new ForbiddenException('Role does not belong to the target tenant');
    }

    const token = randomBytes(32).toString('hex');
    const invitation = (await this.prisma.invitation.create({
      data: {
        tokenHash: this.hashToken(token),
        tenantId: data.tenantId,
        invitedEmail: data.invitedEmail,
        roleId: data.roleId,
        invitedById: data.invitedById,
        purpose: 'TENANT_MEMBERSHIP',
        invitedPrincipalId: null,
        policyDocumentId: null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    })) as Invitation;
    await this.recordIdentityEvent({
      eventType: 'tenant_invitation_created',
      actorId: data.invitedById,
      tenantId: data.tenantId,
      data: { invitationId: invitation.id, roleId: data.roleId },
    });
    return { invitation, token };
  }

  async acceptInvitation(
    token: string,
    acceptingPrincipalId: string,
    acceptingPrincipalEmail: string,
  ): Promise<TenantMembershipWithRoles> {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        purpose: 'TENANT_MEMBERSHIP',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) {
      throw new NotFoundException(
        'Invitation not found, expired or already used',
      );
    }
    if (
      invitation.invitedEmail.toLowerCase() !==
      acceptingPrincipalEmail.toLowerCase()
    ) {
      throw new ForbiddenException(
        'This invitation was issued to a different email address',
      );
    }

    const existing = await this.prisma.tenantMembership.findUnique({
      where: {
        tenantId_principalId: {
          tenantId: invitation.tenantId,
          principalId: acceptingPrincipalId,
        },
      },
      include: MEMBERSHIP_WITH_ROLES_INCLUDE,
    });
    const role = await this.prisma.role.findUnique({
      where: { id: invitation.roleId },
    });
    if (!role) {
      throw new BadRequestException('Invitation role no longer exists');
    }

    let membership: TenantMembershipWithRoles;
    if (!existing) {
      membership = toMembershipWithRoles(
        await this.prisma.tenantMembership.create({
          data: {
            tenantId: invitation.tenantId,
            principalId: acceptingPrincipalId,
            status: 'ACTIVE',
            source: 'INVITATION',
            roles: { create: [{ role_id: role.id }] },
          },
          include: MEMBERSHIP_WITH_ROLES_INCLUDE,
        }),
      );
    } else {
      membership = toMembershipWithRoles(existing);
      if (!membership.roles.some((r) => r.id === role.id)) {
        await this.prisma.userRole.create({
          data: { membership_id: membership.id, role_id: role.id },
        });
        membership.roles.push(toRole(role));
      }
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedById: acceptingPrincipalId,
      },
    });

    await this.recordIdentityEvent({
      eventType: 'tenant_membership_created',
      principalId: acceptingPrincipalId,
      actorId: acceptingPrincipalId,
      tenantId: invitation.tenantId,
      data: {
        membershipId: membership.id,
        source: 'INVITATION',
        roleId: role.id,
      },
    });

    return membership;
  }

  async listInvitations(tenantId: string) {
    const invitations = (await this.prisma.invitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })) as Invitation[];
    return invitations.map(
      ({ tokenHash: _tokenHash, ...invitation }) => invitation,
    );
  }

  async listMembers(
    tenantId: string,
  ): Promise<TenantMembershipWithPermissions[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: MEMBERSHIP_WITH_PERMISSIONS_INCLUDE,
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map(toMembershipWithPermissions);
  }

  async updateMember(
    tenantId: string,
    memberId: string,
    input: {
      roleIds?: string[];
      status?: 'ACTIVE' | 'SUSPENDED';
      actorId?: string;
    },
  ): Promise<TenantMembershipWithRoles> {
    const found = await this.prisma.tenantMembership.findFirst({
      where: { id: memberId, tenantId },
      include: MEMBERSHIP_WITH_ROLES_INCLUDE,
    });
    if (!found)
      throw new NotFoundException(`Tenant member ${memberId} not found`);
    const membership = toMembershipWithRoles(found);
    const before = {
      status: membership.status,
      roleIds: membership.roles.map((role) => role.id).sort(),
    };

    let roles: Role[] | undefined;
    if (input.roleIds) {
      roles = input.roleIds.length
        ? (
            await this.prisma.role.findMany({
              where: { id: { in: input.roleIds } },
            })
          ).map(toRole)
        : [];
      if (roles.length !== input.roleIds.length)
        throw new BadRequestException('One or more roles do not exist');
      if (
        roles.some(
          (role) =>
            role.roleLevel !== 'TENANT' ||
            (role.tenantId && role.tenantId !== tenantId),
        )
      ) {
        throw new ForbiddenException(
          'Every assigned role must be valid for the target tenant',
        );
      }
    }
    const assignedRoles = roles;
    const saved = await this.prisma.$transaction(async (tx) => {
      if (input.status) {
        await tx.tenantMembership.update({
          where: { id: membership.id },
          data: { status: input.status },
        });
      }
      if (assignedRoles) {
        await tx.userRole.deleteMany({
          where: { membership_id: membership.id },
        });
        if (assignedRoles.length) {
          await tx.userRole.createMany({
            data: assignedRoles.map((role) => ({
              membership_id: membership.id,
              role_id: role.id,
            })),
          });
        }
      }
      return toMembershipWithRoles(
        await tx.tenantMembership.findUniqueOrThrow({
          where: { id: membership.id },
          include: MEMBERSHIP_WITH_ROLES_INCLUDE,
        }),
      );
    });
    await this.prisma.session.updateMany({
      where: { membershipId: membership.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: input.status
          ? 'MEMBERSHIP_STATUS_CHANGED'
          : 'MEMBERSHIP_ROLES_CHANGED',
      },
    });
    await this.recordIdentityEvent({
      eventType: 'tenant_membership_changed',
      principalId: membership.principalId,
      actorId: input.actorId,
      tenantId,
      data: {
        membershipId: membership.id,
        before,
        after: {
          status: saved.status,
          roleIds: saved.roles.map((role) => role.id).sort(),
        },
      },
    });
    return saved;
  }

  async removeMember(
    tenantId: string,
    memberId: string,
    actorId?: string,
  ): Promise<TenantMembershipWithRoles> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: memberId, tenantId },
    });
    if (!membership)
      throw new NotFoundException(`Tenant member ${memberId} not found`);
    // Mark the membership removed and drop every role assignment together,
    // as the former save of `{ status: 'REMOVED', roles: [] }` did.
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { membership_id: membership.id } });
      return tx.tenantMembership.update({
        where: { id: membership.id },
        data: { status: 'REMOVED' },
      });
    });
    await this.prisma.session.updateMany({
      where: { membershipId: membership.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'MEMBERSHIP_REMOVED' },
    });
    await this.recordIdentityEvent({
      eventType: 'tenant_membership_removed',
      principalId: membership.principalId,
      actorId,
      tenantId,
      data: { membershipId: membership.id },
    });
    return toMembershipWithRoles({ ...saved, roles: [] });
  }

  private async recordIdentityEvent(input: {
    eventType: string;
    principalId?: string;
    actorId?: string;
    tenantId: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.identityEvent.create({
      data: {
        eventType: input.eventType,
        principalId: input.principalId ?? null,
        actorId: input.actorId ?? null,
        tenantId: input.tenantId,
        correlationId: null,
        data: input.data as Prisma.InputJsonValue,
      },
    });
  }
}
