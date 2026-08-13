import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorAuthenticationError } from '../core/connector-errors';

/**
 * Resolves a stored vault-reference string to the actual secret value.
 * `ConnectorCredentialReference.vaultReferenceId` never holds the secret
 * itself — only a reference. This MVP resolves that reference against
 * environment variables (same honest, non-fake-placeholder pattern used
 * for MailService's SMTP credentials); swap for a real vault/KMS client
 * without changing any caller.
 */
@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveSecret(vaultReferenceId: string): string {
    const value = process.env[vaultReferenceId];
    if (!value) {
      throw new ConnectorAuthenticationError(
        `Vault reference '${vaultReferenceId}' is not resolvable — no environment value set`,
      );
    }
    return value;
  }

  async getActiveCredential(instanceId: string) {
    const credential = await this.prisma.connectorCredentialReference.findFirst(
      {
        where: { instanceId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      },
    );
    if (!credential) {
      throw new ConnectorAuthenticationError(
        `No active credential reference for connector instance '${instanceId}'`,
      );
    }
    return credential;
  }

  async resolveClientSecret(instanceId: string): Promise<string> {
    const credential = await this.getActiveCredential(instanceId);
    return this.resolveSecret(credential.vaultReferenceId);
  }

  async storeCredentialReference(
    tenantId: string,
    instanceId: string,
    vaultReferenceId: string,
    credentialType = 'CLIENT_SECRET',
  ) {
    this.logger.log(
      `Storing credential reference for instance ${instanceId} (${credentialType})`,
    );
    return this.prisma.connectorCredentialReference.create({
      data: {
        tenant_id: tenantId,
        instanceId,
        vaultReferenceId,
        credentialType,
        status: 'ACTIVE',
      },
    });
  }

  async rotateCredential(instanceId: string, newVaultReferenceId: string) {
    const current = await this.prisma.connectorCredentialReference.findFirst({
      where: { instanceId, status: 'ACTIVE' },
    });
    if (current) {
      await this.prisma.connectorCredentialReference.update({
        where: { id: current.id },
        data: { status: 'ROTATED', rotatedAt: new Date() },
      });
    }
    return this.storeCredentialReference(
      current?.tenant_id ?? '',
      instanceId,
      newVaultReferenceId,
      current?.credentialType ?? 'CLIENT_SECRET',
    );
  }
}
