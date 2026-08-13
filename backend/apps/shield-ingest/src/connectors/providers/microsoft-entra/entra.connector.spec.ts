import { Test, TestingModule } from '@nestjs/testing';
import { EntraConnectorService } from './entra.connector';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConnectorRegistry } from '../../core/connector-registry';
import { EntraAuthService } from './entra.auth';
import { EntraTokenService } from './entra.token.service';
import { EntraUserSyncService } from './entra.user-sync';
import { EntraSignInSyncService } from './entra.signin-sync';
import { EntraGraphClient } from './entra.client';
import { EntraHealthService } from './entra.health';
import { CredentialService } from '../../services/credential.service';
import { PermissionService } from '../../services/permission.service';
import { ConnectorHealthService } from '../../services/health.service';

describe('EntraConnectorService', () => {
  let service: EntraConnectorService;
  let prismaMock: any;
  let registryMock: any;
  let authMock: any;
  let tokenMock: any;
  let permissionMock: any;
  let connectorHealthMock: any;
  let credentialMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorDefinition: { findUnique: jest.fn(), create: jest.fn() },
      connectorInstance: { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      connectorOauthState: { create: jest.fn().mockResolvedValue({ id: 'oauth-state-1' }) },
    };
    registryMock = { register: jest.fn() };
    authMock = { generateAuthUrl: jest.fn().mockReturnValue('https://login.microsoftonline.com/consent') };
    tokenMock = { getAccessToken: jest.fn(), invalidate: jest.fn(), decodeGrantedRoles: jest.fn() };
    permissionMock = {
      declareRequired: jest.fn().mockResolvedValue(undefined),
      reconcileGranted: jest.fn().mockResolvedValue({ newlyMissing: [] }),
      getGranted: jest.fn().mockResolvedValue([]),
      getMissingRequired: jest.fn().mockResolvedValue([]),
    };
    connectorHealthMock = { updatePermissionStatus: jest.fn().mockResolvedValue(undefined) };
    credentialMock = { storeCredentialReference: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntraConnectorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConnectorRegistry, useValue: registryMock },
        { provide: EntraAuthService, useValue: authMock },
        { provide: EntraTokenService, useValue: tokenMock },
        { provide: EntraUserSyncService, useValue: { syncUsers: jest.fn() } },
        { provide: EntraSignInSyncService, useValue: { pollSignInLogs: jest.fn() } },
        { provide: EntraGraphClient, useValue: { request: jest.fn() } },
        { provide: EntraHealthService, useValue: { checkHealth: jest.fn() } },
        { provide: CredentialService, useValue: credentialMock },
        { provide: PermissionService, useValue: permissionMock },
        { provide: ConnectorHealthService, useValue: connectorHealthMock },
      ],
    }).compile();

    service = module.get<EntraConnectorService>(EntraConnectorService);
  });

  it('registers itself into the ConnectorRegistry under the microsoft-entra key on module init', () => {
    service.onModuleInit();

    expect(registryMock.register).toHaveBeenCalledWith('microsoft-entra', service);
  });

  it('creates a tenant-scoped ConnectorInstance in AWAITING_ADMIN_CONSENT and declares required permissions', async () => {
    prismaMock.connectorDefinition.findUnique.mockResolvedValue({ id: 'def-1', provider: 'microsoft-entra' });
    prismaMock.connectorInstance.create.mockResolvedValue({ id: 'instance-1' });

    const result = await service.connect(
      {
        connectorInstanceId: '',
        tenantId: 'tenant-a',
        environmentId: 'env-1',
        region: 'us',
        purpose: 'security-monitoring',
        correlationId: 'corr-1',
        traceId: 'trace-1',
      },
      {},
    );

    expect(result.status).toBe('AWAITING_ADMIN_CONSENT');
    expect(prismaMock.connectorInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenant_id: 'tenant-a', state: 'AWAITING_ADMIN_CONSENT' }) }),
    );
    expect(permissionMock.declareRequired).toHaveBeenCalledWith('tenant-a', 'instance-1', 'microsoft-entra', expect.any(Array));
    expect(prismaMock.connectorOauthState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 'tenant-a',
        instance_id: 'instance-1',
        state_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expires_at: expect.any(Date),
      }),
    });
    expect(authMock.generateAuthUrl).toHaveBeenCalledWith('tenant-a', expect.any(String));
  });

  it('persists the externalTenantId on consent completion instead of discarding it', async () => {
    prismaMock.connectorInstance.update.mockResolvedValue({ id: 'instance-1', tenant_id: 'tenant-a' });

    await service.completeConsent('instance-1', 'customer-azure-tenant-id');

    expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
      data: { externalTenantId: 'customer-azure-tenant-id', state: 'CONNECTED' },
    });
    expect(credentialMock.storeCredentialReference).toHaveBeenCalledWith(
      'tenant-a',
      'instance-1',
      'ENTRA_CLIENT_SECRET',
      'CLIENT_SECRET',
    );
  });

  it('invalidates the cached token on disconnect so a stale token cannot be reused after tenant offboarding', async () => {
    prismaMock.connectorInstance.update.mockResolvedValue({});

    await service.disconnect({
      connectorInstanceId: 'instance-1',
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      region: 'us',
      purpose: 'security-monitoring',
      correlationId: 'corr-1',
      traceId: 'trace-1',
    });

    expect(tokenMock.invalidate).toHaveBeenCalledWith('instance-1');
    expect(prismaMock.connectorInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'instance-1' }, data: expect.objectContaining({ state: 'DISCONNECTED' }) }),
    );
  });
});
