import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SCIM_SCHEMAS, SCIM_SERVICE_PROVIDER_CONFIG } from './scim.constants';
import { CreateScimUserDto } from './dto/scim-user.dto';
import { CreateScimGroupDto } from './dto/scim-group.dto';
import { ScimPatchDto } from './dto/scim-patch.dto';

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  displayName?: string;
  active: boolean;
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
    location: string;
    version?: string;
  };
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  displayName: string;
  members: Array<{ value: string; display?: string; $ref?: string }>;
  meta: {
    resourceType: 'Group';
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  // In-memory tenant partitioned SCIM store with deterministic persistence behavior
  private readonly users = new Map<string, Map<string, ScimUserResource>>();
  private readonly groups = new Map<string, Map<string, ScimGroupResource>>();

  private getTenantUsers(tenantId: string): Map<string, ScimUserResource> {
    if (!this.users.has(tenantId)) {
      this.users.set(tenantId, new Map());
    }
    return this.users.get(tenantId)!;
  }

  private getTenantGroups(tenantId: string): Map<string, ScimGroupResource> {
    if (!this.groups.has(tenantId)) {
      this.groups.set(tenantId, new Map());
    }
    return this.groups.get(tenantId)!;
  }

  getServiceProviderConfig() {
    return SCIM_SERVICE_PROVIDER_CONFIG;
  }

  getResourceTypes() {
    return [
      {
        schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        description: 'User Account Resource',
        schema: SCIM_SCHEMAS.USER,
      },
      {
        schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        description: 'Group Resource',
        schema: SCIM_SCHEMAS.GROUP,
      },
    ];
  }

  async listUsers(
    tenantId: string,
    startIndex = 1,
    count = 100,
  ): Promise<ScimListResponse<ScimUserResource>> {
    const userMap = this.getTenantUsers(tenantId);
    const allUsers = Array.from(userMap.values());
    const paginated = allUsers.slice(startIndex - 1, startIndex - 1 + count);

    return {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults: allUsers.length,
      startIndex,
      itemsPerPage: paginated.length,
      Resources: paginated,
    };
  }

  async getUser(tenantId: string, id: string): Promise<ScimUserResource> {
    const user = this.getTenantUsers(tenantId).get(id);
    if (!user) {
      throw new NotFoundException(`SCIM User '${id}' not found`);
    }
    return user;
  }

  async createUser(
    tenantId: string,
    dto: CreateScimUserDto,
  ): Promise<ScimUserResource> {
    const userMap = this.getTenantUsers(tenantId);
    const id =
      dto.externalId ||
      `scim-usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Check duplicate userName
    for (const u of userMap.values()) {
      if (u.userName.toLowerCase() === dto.userName.toLowerCase()) {
        throw new ConflictException(
          `User with userName '${dto.userName}' already exists`,
        );
      }
    }

    const now = new Date().toISOString();
    const resource: ScimUserResource = {
      schemas: [SCIM_SCHEMAS.USER],
      id,
      externalId: dto.externalId,
      userName: dto.userName,
      name: dto.name,
      displayName: dto.displayName || dto.userName,
      active: dto.active ?? true,
      emails: dto.emails || [{ value: dto.userName, primary: true }],
      meta: {
        resourceType: 'User',
        created: now,
        lastModified: now,
        location: `/api/v1/scim/v2/Users/${id}`,
      },
    };

    userMap.set(id, resource);
    this.logger.log(
      `Provisioned SCIM user '${dto.userName}' (ID: ${id}) for tenant '${tenantId}'`,
    );
    return resource;
  }

  async patchUser(
    tenantId: string,
    id: string,
    patch: ScimPatchDto,
  ): Promise<ScimUserResource> {
    const user = await this.getUser(tenantId, id);
    const now = new Date().toISOString();

    for (const op of patch.Operations || []) {
      if (
        op.op.toLowerCase() === 'replace' &&
        typeof op.value === 'object' &&
        op.value !== null
      ) {
        if ('active' in op.value) {
          user.active = Boolean(op.value.active);
        }
      }
    }

    user.meta.lastModified = now;
    return user;
  }

  async deleteUser(tenantId: string, id: string): Promise<void> {
    const userMap = this.getTenantUsers(tenantId);
    if (!userMap.has(id)) {
      throw new NotFoundException(`SCIM User '${id}' not found`);
    }
    userMap.delete(id);
    this.logger.log(
      `De-provisioned SCIM user '${id}' for tenant '${tenantId}'`,
    );
  }

  async listGroups(
    tenantId: string,
    startIndex = 1,
    count = 100,
  ): Promise<ScimListResponse<ScimGroupResource>> {
    const groupMap = this.getTenantGroups(tenantId);
    const allGroups = Array.from(groupMap.values());
    const paginated = allGroups.slice(startIndex - 1, startIndex - 1 + count);

    return {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults: allGroups.length,
      startIndex,
      itemsPerPage: paginated.length,
      Resources: paginated,
    };
  }

  async createGroup(
    tenantId: string,
    dto: CreateScimGroupDto,
  ): Promise<ScimGroupResource> {
    const groupMap = this.getTenantGroups(tenantId);
    const id = `scim-grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const resource: ScimGroupResource = {
      schemas: [SCIM_SCHEMAS.GROUP],
      id,
      displayName: dto.displayName,
      members: dto.members || [],
      meta: {
        resourceType: 'Group',
        created: now,
        lastModified: now,
        location: `/api/v1/scim/v2/Groups/${id}`,
      },
    };

    groupMap.set(id, resource);
    return resource;
  }
}
