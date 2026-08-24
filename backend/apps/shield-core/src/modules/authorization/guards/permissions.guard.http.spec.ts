import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { RequireAssurance } from '../decorators/require-assurance.decorator';
import { RequirePartnerDelegationScope } from '../../partners/require-partner-delegation-scope.decorator';

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

@UseGuards(PermissionsGuard)
@RequirePermissions('tenant:commercial-account:manage')
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/assurance-probe')
class AssuranceProbeController {
  @Get()
  get() {
    return { allowed: true };
  }
}

@UseGuards(PermissionsGuard)
@RequirePermissions('tenant:partner-delegation:use')
@Controller('api/v1/partner-probe/accounts/:accountId')
class PartnerScopeProbeController {
  @Get('usage')
  @RequirePartnerDelegationScope('VIEW_USAGE')
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

  it('passes declared step-up assurance levels to the policy decision', async () => {
    const authorizationDecision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'PERMIT',
        reasonCode: 'POLICY_PERMIT',
        obligations: [],
      }),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [AssuranceProbeController],
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
        id: 'billing-admin-1',
        email: 'billing@example.com',
        tenantId: 'tenant-a',
        assurance: 'FEDERATED_MFA',
      };
      next();
    });
    await app.init();

    await request(app.getHttpServer())
      .get('/api/v1/assurance-probe')
      .expect(200);

    expect(authorizationDecision.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredAssurance: ['PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY'],
      }),
    );
    await app.close();
  });

  it('passes partner account, managing organization and declared operation scope to the policy decision', async () => {
    const authorizationDecision = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'decision-1',
        decision: 'PERMIT',
        reasonCode: 'POLICY_PERMIT',
        obligations: [],
      }),
    };
    const testingModule = await Test.createTestingModule({
      controllers: [PartnerScopeProbeController],
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
        id: 'partner-user-1',
        email: 'operator@mssp.test',
        tenantId: 'tenant-a',
        environmentId: 'prod-eu',
      };
      next();
    });
    await app.init();

    await request(app.getHttpServer())
      .get('/api/v1/partner-probe/accounts/account-1/usage')
      .set('x-tenant-id', 'tenant-a')
      .set('x-managing-organization-id', 'mssp-org-1')
      .expect(200);

    expect(authorizationDecision.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerDelegationScope: 'VIEW_USAGE',
        partnerCommercialAccountId: 'account-1',
        partnerManagingOrganizationId: 'mssp-org-1',
      }),
    );
    await app.close();
  });
});
