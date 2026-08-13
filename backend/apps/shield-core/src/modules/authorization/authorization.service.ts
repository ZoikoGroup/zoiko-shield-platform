import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { Role, RoleLevel } from './entities/role.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { Invitation } from './entities/invitation.entity';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(TenantMembership)
    private readonly membershipRepository: Repository<TenantMembership>,
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
  ) {}

  async createPermission(code: string, description?: string): Promise<Permission> {
    const existing = await this.permissionRepository.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Permission ${code} already exists`);
    }
    return this.permissionRepository.save(this.permissionRepository.create({ code, description }));
  }

  async createRole(data: {
    tenantId: string | null;
    code: string;
    name: string;
    roleLevel: RoleLevel;
    permissionCodes?: string[];
  }): Promise<Role> {
    const permissions = data.permissionCodes?.length
      ? await this.permissionRepository.findBy({ code: In(data.permissionCodes) })
      : [];
    const role = this.roleRepository.create({
      tenantId: data.tenantId,
      code: data.code,
      name: data.name,
      roleLevel: data.roleLevel,
      permissions,
    });
    return this.roleRepository.save(role);
  }

  findRoles(tenantId?: string): Promise<Role[]> {
    if (tenantId) {
      return this.roleRepository.find({
        where: [{ tenantId }, { tenantId: IsNull() }],
        relations: { permissions: true },
      });
    }
    return this.roleRepository.find({ relations: { permissions: true } });
  }

  async updateRolePermissions(roleId: string, permissionCodes: string[]): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    role.permissions = await this.permissionRepository.findBy({ code: In(permissionCodes) });
    return this.roleRepository.save(role);
  }

  async getPermissionCodesForPrincipal(tenantId: string, principalId: string): Promise<string[]> {
    const codes = new Set<string>();

    // Check tenant-specific membership
    const membership = await this.membershipRepository.findOne({
      where: { tenantId, principalId, status: 'ACTIVE' },
      relations: { roles: { permissions: true } },
    });
    if (membership) {
      for (const role of membership.roles) {
        for (const permission of role.permissions) {
          codes.add(permission.code);
        }
      }
    }

    // Also check platform-scope membership — platform super admins carry
    // their permissions across all tenants (offboarding, deletion, etc.)
    if (tenantId !== '00000000-0000-0000-0000-000000000000') {
      const platformMembership = await this.membershipRepository.findOne({
        where: { tenantId: '00000000-0000-0000-0000-000000000000', principalId, status: 'ACTIVE' },
        relations: { roles: { permissions: true } },
      });
      if (platformMembership) {
        for (const role of platformMembership.roles) {
          for (const permission of role.permissions) {
            codes.add(permission.code);
          }
        }
      }
    }

    return [...codes];
  }

  async hasTenantAccess(tenantId: string, principalId: string): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({
      where: [
        { tenantId, principalId, status: 'ACTIVE' },
        { tenantId: '00000000-0000-0000-0000-000000000000', principalId, status: 'ACTIVE' },
      ],
      select: { id: true },
    });
    return Boolean(membership);
  }

  async getAccessibleTenantIds(principalId: string): Promise<string[]> {
    const memberships = await this.membershipRepository.find({
      where: { principalId, status: 'ACTIVE' },
      select: { tenantId: true },
    });
    return memberships
      .map((membership) => membership.tenantId)
      .filter((tenantId) => tenantId !== '00000000-0000-0000-0000-000000000000');
  }

  /** Returns all active memberships for a principal, with roles and permissions eagerly loaded. */
  async getMembershipsForPrincipal(principalId: string): Promise<TenantMembership[]> {
    return this.membershipRepository.find({
      where: { principalId, status: 'ACTIVE' },
      relations: { roles: { permissions: true } },
    });
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
    const role = await this.roleRepository.findOne({ where: { id: data.roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${data.roleId} not found`);
    }
    if (role.roleLevel === 'PLATFORM') {
      throw new ForbiddenException('Cannot invite a member with a PLATFORM-level role');
    }
    if (role.tenantId && role.tenantId !== data.tenantId) {
      throw new ForbiddenException('Role does not belong to the target tenant');
    }

    const token = randomBytes(32).toString('hex');
    const invitation = await this.invitationRepository.save(
      this.invitationRepository.create({
        tokenHash: this.hashToken(token),
        tenantId: data.tenantId,
        invitedEmail: data.invitedEmail,
        roleId: data.roleId,
        invitedById: data.invitedById,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      }),
    );
    return { invitation, token };
  }

  async acceptInvitation(
    token: string,
    acceptingPrincipalId: string,
    acceptingPrincipalEmail: string,
  ): Promise<TenantMembership> {
    const invitation = await this.invitationRepository.findOne({
      where: { tokenHash: this.hashToken(token), status: 'PENDING', expiresAt: MoreThan(new Date()) },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found, expired or already used');
    }
    if (invitation.invitedEmail.toLowerCase() !== acceptingPrincipalEmail.toLowerCase()) {
      throw new ForbiddenException('This invitation was issued to a different email address');
    }

    let membership = await this.membershipRepository.findOne({
      where: { tenantId: invitation.tenantId, principalId: acceptingPrincipalId },
      relations: { roles: true },
    });
    if (!membership) {
      membership = this.membershipRepository.create({
        tenantId: invitation.tenantId,
        principalId: acceptingPrincipalId,
        status: 'ACTIVE',
        source: 'INVITATION',
        roles: [],
      });
    }
    const role = await this.roleRepository.findOne({ where: { id: invitation.roleId } });
    if (!role) {
      throw new BadRequestException('Invitation role no longer exists');
    }
    if (!membership.roles.some((r) => r.id === role.id)) {
      membership.roles.push(role);
    }
    await this.membershipRepository.save(membership);

    invitation.status = 'ACCEPTED';
    invitation.acceptedAt = new Date();
    invitation.acceptedById = acceptingPrincipalId;
    await this.invitationRepository.save(invitation);

    return membership;
  }

  async listInvitations(tenantId: string) {
    const invitations = await this.invitationRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return invitations.map(({ tokenHash: _tokenHash, ...invitation }) => invitation);
  }

  async listMembers(tenantId: string) {
    return this.membershipRepository.find({
      where: { tenantId },
      relations: { roles: { permissions: true } },
      order: { joinedAt: 'ASC' },
    });
  }

  async updateMember(
    tenantId: string,
    memberId: string,
    input: { roleIds?: string[]; status?: 'ACTIVE' | 'SUSPENDED' },
  ) {
    const membership = await this.membershipRepository.findOne({
      where: { id: memberId, tenantId },
      relations: { roles: true },
    });
    if (!membership) throw new NotFoundException(`Tenant member ${memberId} not found`);

    if (input.status) membership.status = input.status;
    if (input.roleIds) {
      const roles = input.roleIds.length ? await this.roleRepository.findBy({ id: In(input.roleIds) }) : [];
      if (roles.length !== input.roleIds.length) throw new BadRequestException('One or more roles do not exist');
      if (roles.some((role) => role.roleLevel !== 'TENANT' || (role.tenantId && role.tenantId !== tenantId))) {
        throw new ForbiddenException('Every assigned role must be valid for the target tenant');
      }
      membership.roles = roles;
    }
    return this.membershipRepository.save(membership);
  }

  async removeMember(tenantId: string, memberId: string) {
    const membership = await this.membershipRepository.findOne({ where: { id: memberId, tenantId } });
    if (!membership) throw new NotFoundException(`Tenant member ${memberId} not found`);
    membership.status = 'REMOVED';
    membership.roles = [];
    return this.membershipRepository.save(membership);
  }
}
