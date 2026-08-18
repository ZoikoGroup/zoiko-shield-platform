import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Persists/exposes only the public key — private key material never touches Postgres. */
@Injectable()
export class SigningKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(keyId: string, algorithm: string, publicKey: string) {
    const existing = await this.prisma.signingKey.findUnique({
      where: { key_id: keyId },
    });
    if (existing) return existing;
    return this.prisma.signingKey.create({
      data: {
        id: randomUUID(),
        key_id: keyId,
        algorithm,
        public_key: publicKey,
        status: 'ACTIVE',
      },
    });
  }
}
