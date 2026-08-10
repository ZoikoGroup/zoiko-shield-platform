import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { Principal } from '../../identity-adapter/principal.entity';

export interface CreateApiClientInput {
  tenantId: string;
  name: string;
  environmentScope?: string;
  purpose: string;
  createdBy: string;
  expiresAt?: Date;
}

export interface CreatedApiClient {
  apiClient: unknown;
  rawClientSecret: string;
}

const SECRET_BYTE_LENGTH = 32;

function hashSecret(secret: string): string {
  // A password-equivalent hash — sha256 here matches this repo's existing
  // ContentHashService precedent for "strong hash, no external dependency."
  // A production credential store would use a slow KDF (argon2/bcrypt);
  // that's an infra choice deferred alongside the other "not built this
  // pass" items, same framing as DevCheckpointSigner/DevSimulationSigner.
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Developer API clients are non-human principals — reuses the existing
 * principal_type=CLIENT support rather than inventing a second identity
 * system (spec §27). The raw secret is generated once, returned once,
 * never stored in plaintext (spec §29/correction #10).
 */
@Injectable()
export class ApiClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @InjectRepository(Principal) private readonly principalRepository: Repository<Principal>,
  ) {}

  async create(input: CreateApiClientInput): Promise<CreatedApiClient> {
    const principal = await this.principalRepository.save(
      this.principalRepository.create({ principalType: 'CLIENT', source: 'DEVELOPER_API', status: 'ACTIVE' }),
    );

    const clientId = `zsc_${randomUUID().replace(/-/g, '')}`;
    const rawSecret = randomBytes(SECRET_BYTE_LENGTH).toString('base64url');
    const secretHash = hashSecret(rawSecret);
    const fingerprint = secretHash.slice(0, 16);

    const [apiClient] = await this.prisma.$transaction([
      this.prisma.apiClient.create({
        data: {
          id: randomUUID(),
          tenant_id: input.tenantId,
          name: input.name,
          client_id: clientId,
          principal_id: principal.id,
          status: 'ACTIVE',
          environment_scope: input.environmentScope,
          purpose: input.purpose,
          created_by: input.createdBy,
          expires_at: input.expiresAt,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.API_CLIENT_CREATED, eventType: 'api_client.created', payload: { clientId } }),
      }),
    ]);

    await this.prisma.apiClientCredential.create({
      data: { id: randomUUID(), tenant_id: input.tenantId, api_client_id: apiClient.id, secret_version: 1, secret_hash: secretHash, fingerprint, status: 'ACTIVE' },
    });

    return { apiClient, rawClientSecret: rawSecret };
  }

  async verifyCredential(clientId: string, rawSecret: string): Promise<{ apiClient: any; tenantId: string } | null> {
    const apiClient = await this.prisma.apiClient.findUnique({ where: { client_id: clientId } });
    if (!apiClient || apiClient.status !== 'ACTIVE') return null;
    if (apiClient.expires_at && apiClient.expires_at < new Date()) return null;

    const secretHash = hashSecret(rawSecret);
    const credential = await this.prisma.apiClientCredential.findFirst({
      where: { api_client_id: apiClient.id, secret_hash: secretHash, status: { in: ['ACTIVE', 'RETIRING'] } },
    });
    if (!credential || (credential.expires_at && credential.expires_at < new Date())) return null;

    await this.prisma.apiClient.update({ where: { id: apiClient.id }, data: { last_used_at: new Date() } });
    return { apiClient, tenantId: apiClient.tenant_id };
  }

  async suspend(tenantId: string, apiClientId: string) {
    const client = await this.assertTenantOwnership(tenantId, apiClientId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.apiClient.update({ where: { id: client.id }, data: { status: 'SUSPENDED' } }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.API_CLIENT_SUSPENDED, eventType: 'api_client.suspended', payload: { clientId: client.client_id } }) }),
    ]);
    return updated;
  }

  async revoke(tenantId: string, apiClientId: string) {
    const client = await this.assertTenantOwnership(tenantId, apiClientId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.apiClient.update({ where: { id: client.id }, data: { status: 'REVOKED' } }),
      this.prisma.apiClientCredential.updateMany({ where: { api_client_id: client.id, status: { not: 'REVOKED' } }, data: { status: 'REVOKED', revoked_at: new Date() } }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.API_CLIENT_REVOKED, eventType: 'api_client.revoked', payload: { clientId: client.client_id } }) }),
    ]);
    return updated;
  }

  async assertTenantOwnership(tenantId: string, apiClientId: string) {
    const client = await this.prisma.apiClient.findFirst({ where: { id: apiClientId, tenant_id: tenantId } });
    if (!client) {
      throw new NotFoundException(`ApiClient '${apiClientId}' not found`);
    }
    return client;
  }
}
