import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import { createHash } from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import { SamlRequestCacheEntry } from './saml-request-cache.entity';

const SAML_REQUEST_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DatabaseSamlCacheProvider implements CacheProvider {
  constructor(
    @InjectRepository(SamlRequestCacheEntry)
    private readonly repository: Repository<SamlRequestCacheEntry>,
  ) {}

  async saveAsync(key: string, value: string): Promise<CacheItem> {
    const createdAt = Date.now();
    await this.repository.save(
      this.repository.create({
        keyHash: this.hash(key),
        value,
        expiresAt: new Date(createdAt + SAML_REQUEST_TTL_MS),
      }),
    );
    return { value, createdAt };
  }

  async getAsync(key: string): Promise<string | null> {
    const entry = await this.repository.findOne({
      where: { keyHash: this.hash(key), expiresAt: MoreThan(new Date()) },
    });
    return entry?.value ?? null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    const keyHash = this.hash(key);
    const entry = await this.repository.findOne({ where: { keyHash } });
    if (!entry) return null;
    await this.repository.delete({ keyHash });
    return entry.value;
  }

  private hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
