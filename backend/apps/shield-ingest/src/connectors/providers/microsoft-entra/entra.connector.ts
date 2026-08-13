import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConnectorRegistry } from '../../core/connector-registry';
import { ConnectorContext } from '../../core/connector-context';
import {
  SecurityConnector,
  ConnectInput,
  ConnectionResult,
  HealthResult,
  SyncResult,
  PermissionResult,
} from '../../core/connector.interface';
import { EntraAuthService } from './entra.auth';
import { EntraTokenService } from './entra.token.service';
import { EntraUserSyncService } from './entra.user-sync';
import { EntraSignInSyncService } from './entra.signin-sync';
import { EntraGraphClient } from './entra.client';
import { EntraHealthService } from './entra.health';
import { CredentialService } from '../../services/credential.service';
import { PermissionService } from '../../services/permission.service';
import { ConnectorHealthService } from '../../services/health.service';
import { ENTRA_REQUIRED_PERMISSIONS } from './entra.permissions';
import { createHash, randomBytes } from 'crypto';
import { requireRegion } from '../../../security/tenant-context';

/**
 * The Microsoft Entra provider adapter, implementing the generic
 * SecurityConnector interface. Registers itself into ConnectorRegistry on
 * boot under the 'microsoft-entra' key so callers never branch on provider
 * name — they resolve through the registry instead.
 */
@Injectable()
export class EntraConnectorService implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(EntraConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly authService: EntraAuthService,
    private readonly tokenService: EntraTokenService,
    private readonly userSync: EntraUserSyncService,
    private readonly signInSync: EntraSignInSyncService,
    private readonly graphClient: EntraGraphClient,
    private readonly healthService: EntraHealthService,
    private readonly credentialService: CredentialService,
    private readonly permissionService: PermissionService,
    private readonly connectorHealthService: ConnectorHealthService,
  ) {}

  onModuleInit(): void {
    this.registry.register('microsoft-entra', this);
  }

  async connect(context: ConnectorContext, _input: ConnectInput): Promise<ConnectionResult> {
    let definition = await this.prisma.connectorDefinition.findUnique({
      where: { provider: 'microsoft-entra' },
    });
    if (!definition) {
      definition = await this.prisma.connectorDefinition.create({
        data: {
          provider: 'microsoft-entra',
          name: 'Microsoft Entra ID',
          description: 'Connection to Microsoft Entra for user and sign-in logs',
          supportedEvents: ['user.sync', 'signin.log'],
        },
      });
    }

    const instance = await this.prisma.connectorInstance.create({
      data: {
        tenant_id: context.tenantId,
        environment_id: context.environmentId,
        connectorDefId: definition.id,
        name: `Entra Integration - ${context.tenantId}`,
        state: 'AWAITING_ADMIN_CONSENT',
        authentication_type: 'CLIENT_CREDENTIALS',
        source_region: context.region,
      },
    });

    const state = randomBytes(32).toString('base64url');
    await this.prisma.connectorOauthState.create({
      data: {
        tenant_id: context.tenantId,
        instance_id: instance.id,
        state_hash: createHash('sha256').update(state).digest('hex'),
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const authUrl = this.authService.generateAuthUrl(context.tenantId, state);

    await this.permissionService.declareRequired(
      context.tenantId,
      instance.id,
      'microsoft-entra',
      ENTRA_REQUIRED_PERMISSIONS,
    );

    return {
      status: 'AWAITING_ADMIN_CONSENT',
      authUrl,
      instanceId: instance.id,
      state,
    };
  }

  /** Called from the OAuth callback once Microsoft confirms admin consent. */
  async completeConsent(instanceId: string, externalTenantId: string): Promise<void> {
    const instance = await this.prisma.connectorInstance.update({
      where: { id: instanceId },
      data: { externalTenantId, state: 'CONNECTED' },
    });

    // One shared ZoikoShield-side Entra app registration (ENTRA_CLIENT_ID /
    // ENTRA_CLIENT_SECRET) is used with the client-credentials flow against
    // each customer's directory once admin consent has granted access —
    // the vault reference just names the env var, never the secret itself.
    await this.credentialService.storeCredentialReference(
      instance.tenant_id,
      instanceId,
      'ENTRA_CLIENT_SECRET',
      'CLIENT_SECRET',
    );
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const instance = await this.prisma.connectorInstance.findUniqueOrThrow({
      where: { id: context.connectorInstanceId },
    });
    const accessToken = await this.tokenService.getAccessToken(instance.id, instance.tenant_id);
    const healthy = await this.healthService.checkHealth(instance.id, instance.tenant_id, accessToken);
    return healthy
      ? { status: 'success', message: 'Connection test passed! Graph API is reachable.' }
      : { status: 'failure', message: 'Graph API is unreachable or credentials are invalid.' };
  }

  async sync(context: ConnectorContext): Promise<SyncResult> {
    const instance = await this.prisma.connectorInstance.findUniqueOrThrow({
      where: { id: context.connectorInstanceId },
    });
    const accessToken = await this.tokenService.getAccessToken(instance.id, instance.tenant_id);

    const usersProcessed = await this.userSync.syncUsers(
      instance.id,
      instance.tenant_id,
      instance.environment_id,
      accessToken,
    );
    const signInsProcessed = await this.signInSync.pollSignInLogs(
      instance.id,
      instance.tenant_id,
      instance.environment_id,
      requireRegion(instance.source_region),
      accessToken,
    );

    return { recordsProcessed: usersProcessed + signInsProcessed };
  }

  /**
   * Re-checks actually-granted app roles against the required set (§22
   * permission drift detection) by decoding the current access token's
   * `roles` claim, then persists the reconciled state. Falls back to the
   * last-known granted set from the database if the token can't be
   * acquired, so a single failed check doesn't itself look like drift.
   */
  async getPermissions(context: ConnectorContext): Promise<PermissionResult> {
    const instance = await this.prisma.connectorInstance.findUniqueOrThrow({
      where: { id: context.connectorInstanceId },
    });

    try {
      const accessToken = await this.tokenService.getAccessToken(
        instance.id,
        instance.tenant_id,
      );
      const grantedNow = this.tokenService.decodeGrantedRoles(accessToken);
      await this.permissionService.reconcileGranted(context.connectorInstanceId, grantedNow);

      const hasAllRequired = ENTRA_REQUIRED_PERMISSIONS.every((p) => grantedNow.includes(p));
      await this.connectorHealthService.updatePermissionStatus(
        instance.id,
        instance.tenant_id,
        hasAllRequired ? 'OK' : 'DEGRADED',
      );
    } catch (err) {
      this.logger.warn(
        `Permission drift check could not acquire a token for instance ${instance.id}: ${(err as Error).message}`,
      );
    }

    const granted = await this.permissionService.getGranted(context.connectorInstanceId);
    const missing = await this.permissionService.getMissingRequired(context.connectorInstanceId);
    return { granted, missing };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    await this.prisma.connectorInstance.update({
      where: { id: context.connectorInstanceId },
      data: { state: 'DISCONNECTED', deletedAt: new Date() },
    });
    this.tokenService.invalidate(context.connectorInstanceId);
    this.logger.log(`Disconnected Entra instance ${context.connectorInstanceId}`);
  }
}
