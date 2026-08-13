import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PermissionsGuard } from './permissions.guard';
import { AuthorizationService } from '../authorization.service';

@UseGuards(PermissionsGuard)
@Controller('api/v1/tenants/:tenantId/guard-probe')
class GuardProbeController {
  @Get()
  get(@Param('tenantId') tenantId: string) {
    return { tenantId };
  }
}

describe('PermissionsGuard tenant isolation over HTTP', () => {
  it('allows an active membership and denies another tenant with the same JWT principal', async () => {
    const authorization = {
      hasTenantAccess: jest.fn(async (tenantId: string) => tenantId === 'tenant-a'),
      getPermissionCodesForPrincipal: jest.fn(async () => []),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [GuardProbeController],
      providers: [PermissionsGuard, { provide: AuthorizationService, useValue: authorization }],
    }).compile();
    const app = testingModule.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'principal-1', email: 'analyst@example.com' };
      next();
    });
    await app.init();

    await request(app.getHttpServer()).get('/api/v1/tenants/tenant-a/guard-probe').expect(200, { tenantId: 'tenant-a' });
    await request(app.getHttpServer()).get('/api/v1/tenants/tenant-b/guard-probe').expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-a/guard-probe')
      .set('x-tenant-id', 'tenant-b')
      .expect(400);

    await app.close();
  });
});
