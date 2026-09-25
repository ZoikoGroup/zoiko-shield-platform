import { Injectable } from '@nestjs/common';
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const SAML_REQUEST_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DatabaseSamlCacheProvider implements CacheProvider {
  constructor(private readonly prisma: PrismaService) {}

  async saveAsync(key: string, value: string): Promise<CacheItem> {
    const createdAt = Date.now();
    // TypeORM save() upserted on the primary key; keep that behaviour so a
    // re-used request id overwrites rather than failing on the unique key.
    const keyHash = this.hash(key);
    const expiresAt = new Date(createdAt + SAML_REQUEST_TTL_MS);
    await this.prisma.samlRequestCache.upsert({
      where: { keyHash },
      create: { keyHash, value, expiresAt },
      update: { value, expiresAt },
    });
    return { value, createdAt };
  }

  async getAsync(key: string): Promise<string | null> {
    const entry = await this.prisma.samlRequestCache.findFirst({
      where: { keyHash: this.hash(key), expiresAt: { gt: new Date() } },
    });
    return entry?.value ?? null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    const keyHash = this.hash(key);
    const entry = await this.prisma.samlRequestCache.findUnique({
      where: { keyHash },
    });
    if (!entry) return null;
    await this.prisma.samlRequestCache.deleteMany({ where: { keyHash } });
    return entry.value;
  }

  private hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
