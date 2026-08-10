import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { PolicyDocument } from './policy-document.entity';
import { PolicyAcceptance } from './policy-acceptance.entity';

const TERMS_OF_SERVICE_V1_TEXT =
  'ZoikoShield Terms of Service v1 (placeholder — replace with the approved, legally reviewed text before production use).';

// W06 "Tenant onboarding wizard": access disclosure must be shown and
// accepted, with generated evidence, before a tenant is activated.
const ACCESS_DISCLOSURE_V1_TEXT =
  'ZoikoShield Access Disclosure v1 (placeholder — replace with the approved data-processing/access-disclosure text before production use).';

@Injectable()
export class PolicyService implements OnModuleInit {
  constructor(
    @InjectRepository(PolicyDocument)
    private readonly policyDocumentRepository: Repository<PolicyDocument>,
    @InjectRepository(PolicyAcceptance)
    private readonly policyAcceptanceRepository: Repository<PolicyAcceptance>,
  ) {}

  /** Seeds v1 policy documents on boot if they don't already exist, so registration/onboarding always has an active policy to reference. */
  async onModuleInit(): Promise<void> {
    await this.seedIfMissing('TERMS_OF_SERVICE', '1', TERMS_OF_SERVICE_V1_TEXT);
    await this.seedIfMissing('ACCESS_DISCLOSURE', '1', ACCESS_DISCLOSURE_V1_TEXT);
  }

  private async seedIfMissing(kind: string, version: string, text: string): Promise<void> {
    const existing = await this.policyDocumentRepository.findOne({ where: { kind, version } });
    if (!existing) {
      await this.policyDocumentRepository.save(
        this.policyDocumentRepository.create({
          kind,
          version,
          publishedAt: new Date(),
          contentHash: createHash('sha256').update(text).digest('hex'),
          active: true,
        }),
      );
    }
  }

  findActive(kind: string): Promise<PolicyDocument | null> {
    return this.policyDocumentRepository.findOne({ where: { kind, active: true }, order: { publishedAt: 'DESC' } });
  }

  findByKindAndVersion(kind: string, version: string): Promise<PolicyDocument | null> {
    return this.policyDocumentRepository.findOne({ where: { kind, version } });
  }

  async recordAcceptance(
    principalId: string,
    policyDocumentId: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    await this.policyAcceptanceRepository.save(
      this.policyAcceptanceRepository.create({
        principalId,
        policyDocumentId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      }),
    );
  }
}
