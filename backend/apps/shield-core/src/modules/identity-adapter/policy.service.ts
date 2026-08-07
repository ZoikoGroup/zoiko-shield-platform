import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { PolicyDocument } from './policy-document.entity';
import { PolicyAcceptance } from './policy-acceptance.entity';

const TERMS_OF_SERVICE_V1_TEXT =
  'ZoikoShield Terms of Service v1 (placeholder — replace with the approved, legally reviewed text before production use).';

@Injectable()
export class PolicyService implements OnModuleInit {
  constructor(
    @InjectRepository(PolicyDocument)
    private readonly policyDocumentRepository: Repository<PolicyDocument>,
    @InjectRepository(PolicyAcceptance)
    private readonly policyAcceptanceRepository: Repository<PolicyAcceptance>,
  ) {}

  /** Seeds the v1 Terms of Service on boot if it doesn't already exist, so registration always has an active policy to reference. */
  async onModuleInit(): Promise<void> {
    const existing = await this.policyDocumentRepository.findOne({
      where: { kind: 'TERMS_OF_SERVICE', version: '1' },
    });
    if (!existing) {
      await this.policyDocumentRepository.save(
        this.policyDocumentRepository.create({
          kind: 'TERMS_OF_SERVICE',
          version: '1',
          publishedAt: new Date(),
          contentHash: createHash('sha256').update(TERMS_OF_SERVICE_V1_TEXT).digest('hex'),
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
