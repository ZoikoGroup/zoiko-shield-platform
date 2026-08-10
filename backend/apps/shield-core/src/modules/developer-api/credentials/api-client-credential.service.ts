import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Overlap rotation (spec §30): v1 stays ACTIVE, v2 is created ACTIVE too
 * (both verifiable during the overlap window — ApiClientService.verifyCredential
 * accepts ACTIVE or RETIRING), caller marks v1 RETIRING once the new
 * secret is confirmed distributed, then revokeRetired() finalizes it.
 */
@Injectable()
export class ApiClientCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async rotate(tenantId: string, apiClientId: string) {
    const current = await this.prisma.apiClientCredential.findFirst({ where: { api_client_id: apiClientId, status: 'ACTIVE' }, orderBy: { secret_version: 'desc' } });
    const nextVersion = (current?.secret_version ?? 0) + 1;

    const rawSecret = randomBytes(32).toString('base64url');
    const secretHash = hashSecret(rawSecret);
    const fingerprint = secretHash.slice(0, 16);

    const [credential] = await this.prisma.$transaction([
      this.prisma.apiClientCredential.create({
        data: { id: randomUUID(), tenant_id: tenantId, api_client_id: apiClientId, secret_version: nextVersion, secret_hash: secretHash, fingerprint, status: 'ACTIVE', rotated_from_id: current?.id },
      }),
      ...(current ? [this.prisma.apiClientCredential.update({ where: { id: current.id }, data: { status: 'RETIRING' } })] : []),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.API_CLIENT_CREDENTIAL_ROTATED, eventType: 'api_client.credential.rotated', payload: { apiClientId, newVersion: nextVersion } }) }),
    ]);

    return { credential, rawClientSecret: rawSecret };
  }

  async revokeRetired(tenantId: string, apiClientId: string) {
    return this.prisma.apiClientCredential.updateMany({
      where: { tenant_id: tenantId, api_client_id: apiClientId, status: 'RETIRING' },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });
  }
}
