import { Test, TestingModule } from '@nestjs/testing';
import { ScimService } from './scim.service';

describe('ScimService', () => {
  let service: ScimService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScimService],
    }).compile();

    service = module.get<ScimService>(ScimService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return service provider configuration per RFC7644', () => {
    const config = service.getServiceProviderConfig();
    expect(config.schemas).toContain(
      'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    );
    expect(config.patch.supported).toBe(true);
  });

  it('should provision, list, and patch a SCIM user', async () => {
    const tenantId = 'tenant-test-scim';
    const user = await service.createUser(tenantId, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'john.doe@enterprise.com',
      displayName: 'John Doe',
      active: true,
    });

    expect(user.id).toBeDefined();
    expect(user.userName).toBe('john.doe@enterprise.com');
    expect(user.active).toBe(true);

    const list = await service.listUsers(tenantId);
    expect(list.totalResults).toBe(1);
    expect(list.Resources[0].id).toBe(user.id);

    const patched = await service.patchUser(tenantId, user.id, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', value: { active: false } }],
    });

    expect(patched.active).toBe(false);
  });

  it('should create and list SCIM groups', async () => {
    const tenantId = 'tenant-test-scim';
    const group = await service.createGroup(tenantId, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      displayName: 'SecOps-L2-Investigators',
    });

    expect(group.id).toBeDefined();
    expect(group.displayName).toBe('SecOps-L2-Investigators');

    const groups = await service.listGroups(tenantId);
    expect(groups.totalResults).toBe(1);
  });
});
