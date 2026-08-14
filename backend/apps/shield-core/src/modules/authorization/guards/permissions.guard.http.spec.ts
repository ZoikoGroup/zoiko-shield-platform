import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';

@UseGuards(PermissionsGuard)
@Controller('api/v1/tenants/:tenantId/guard-probe')
class GuardProbeController {
  @Get()
  get(@Param('tenantId') tenantId: string) {
    return { tenantId };
  }
}

@UseGuards(PermissionsGuard)
@RequirePermissions('case:read')
@Controller('api/v1/permission-probe')
class PermissionProbeController {
  @Get()
  get() {
    return { allowed: true };
  }
}

describe('PermissionsGuard tenant isolation over HTTP', () => {
  it('allows an active membership and denies another tenant with the same JWT principal', async () => {
    const authorizationDecision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'PERMIT',
        reasonCode: 'POLICY_PERMIT',
        obligations: [],
      }),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [GuardProbeController],
      providers: [
        PermissionsGuard,
        {
          provide: AuthorizationDecisionService,
          useValue: authorizationDecision,
        },
      ],
    }).compile();
    const app = testingModule.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'principal-1',
        email: 'analyst@example.com',
        tenantId: 'tenant-a',
      };
      next();
    });
    await app.init();

    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-a/guard-probe')
      .expect(200, { tenantId: 'tenant-a' });
    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-b/guard-probe')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-a/guard-probe')
      .set('x-tenant-id', 'tenant-b')
      .expect(400);

    await app.close();
  });

  it('denies an authentication-only principal with no tenant binding', async () => {
    const authorizationDecision = {
      evaluate: jest.fn(),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [GuardProbeController],
      providers: [
        PermissionsGuard,
        {
          provide: AuthorizationDecisionService,
          useValue: authorizationDecision,
        },
      ],
    }).compile();
    const app = testingModule.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'principal-1', email: 'analyst@example.com' };
      next();
    });
    await app.init();

    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-a/guard-probe')
      .expect(403);
    expect(authorizationDecision.evaluate).not.toHaveBeenCalled();

    await app.close();
  });

  it('denies inactive membership and missing action permission', async () => {
    const authorizationDecision = {
      evaluate: jest
        .fn()
        .mockResolvedValueOnce({
          authorizationDecisionId: 'decision-1',
          decision: 'DENY',
          reasonCode: 'ACTIVE_MEMBERSHIP_REQUIRED',
          obligations: ['DENY_EXECUTION'],
        })
        .mockResolvedValueOnce({
          authorizationDecisionId: 'decision-2',
          decision: 'DENY',
          reasonCode: 'PERMISSION_REQUIRED',
          obligations: ['DENY_EXECUTION'],
        })
        .mockResolvedValueOnce({
          authorizationDecisionId: 'decision-3',
          decision: 'PERMIT',
          reasonCode: 'POLICY_PERMIT',
          obligations: [],
        }),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [GuardProbeController, PermissionProbeController],
      providers: [
        PermissionsGuard,
        {
          provide: AuthorizationDecisionService,
          useValue: authorizationDecision,
        },
      ],
    }).compile();
    const app = testingModule.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'principal-1',
        email: 'analyst@example.com',
        tenantId: 'tenant-a',
      };
      next();
    });
    await app.init();

    await request(app.getHttpServer())
      .get('/api/v1/tenants/tenant-a/guard-probe')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/permission-probe')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/permission-probe')
      .expect(200, { allowed: true });

    await app.close();
  });
});
