import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { Role, RoleLevel } from './entities/role.entity';
import { TenantMembership } from './entities/tenant-membership.entity';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(TenantMembership)
    private readonly membershipRepository: Repository<TenantMembership>,
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

  async ensureMembership(tenantId: string, userId: string): Promise<TenantMembership> {
    let membership = await this.membershipRepository.findOne({
      where: { tenantId, userId },
      relations: { roles: { permissions: true } },
    });
    if (!membership) {
      membership = await this.membershipRepository.save(
        this.membershipRepository.create({ tenantId, userId, status: 'ACTIVE', roles: [] }),
      );
    }
    return membership;
  }

  async assignRole(tenantId: string, userId: string, roleId: string): Promise<TenantMembership> {
    const membership = await this.ensureMembership(tenantId, userId);
    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    if (!membership.roles.some((r) => r.id === role.id)) {
      membership.roles.push(role);
      await this.membershipRepository.save(membership);
    }
    return membership;
  }

  async getPermissionCodesForUser(tenantId: string, userId: string): Promise<string[]> {
    const membership = await this.membershipRepository.findOne({
      where: { tenantId, userId, status: 'ACTIVE' },
      relations: { roles: { permissions: true } },
    });
    if (!membership) {
      return [];
    }
    const codes = new Set<string>();
    for (const role of membership.roles) {
      for (const permission of role.permissions) {
        codes.add(permission.code);
      }
    }
    return [...codes];
  }
}
