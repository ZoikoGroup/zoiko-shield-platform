import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { PolicyDocument } from './policy-document.entity';

const DEVELOPMENT_TERMS_TEXT =
  'ZoikoShield development terms: authorized evaluation use only; production publication requires configured approved policy text.';

// W06 "Tenant onboarding wizard": access disclosure must be shown and
// accepted, with generated evidence, before a tenant is activated.
const DEVELOPMENT_ACCESS_DISCLOSURE_TEXT =
  'ZoikoShield development access disclosure: security telemetry is processed only for the selected tenant, purpose, region, retention policy, and authorized support scope.';

@Injectable()
export class PolicyService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** Seeds v1 policy documents on boot if they don't already exist, so registration/onboarding always has an active policy to reference. */
  async onModuleInit(): Promise<void> {
    const termsText =
      process.env.TERMS_OF_SERVICE_TEXT ?? DEVELOPMENT_TERMS_TEXT;
    const disclosureText =
      process.env.ACCESS_DISCLOSURE_TEXT ?? DEVELOPMENT_ACCESS_DISCLOSURE_TEXT;
    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.TERMS_OF_SERVICE_TEXT ||
        !process.env.ACCESS_DISCLOSURE_TEXT)
    ) {
      throw new Error(
        'Approved TERMS_OF_SERVICE_TEXT and ACCESS_DISCLOSURE_TEXT must be configured in production',
      );
    }
    await this.seedIfMissing(
      'TERMS_OF_SERVICE',
      process.env.TERMS_OF_SERVICE_VERSION ?? '1',
      termsText,
    );
    await this.seedIfMissing(
      'ACCESS_DISCLOSURE',
      process.env.ACCESS_DISCLOSURE_VERSION ?? '1',
      disclosureText,
    );
  }

  private async seedIfMissing(
    kind: string,
    version: string,
    text: string,
  ): Promise<void> {
    const existing = await this.prisma.policyDocument.findUnique({
      where: { kind_version: { kind, version } },
    });
    if (!existing) {
      await this.prisma.policyDocument.create({
        data: {
          kind,
          version,
          publishedAt: new Date(),
          contentHash: createHash('sha256').update(text).digest('hex'),
          active: true,
        },
      });
    }
  }

  findActive(kind: string): Promise<PolicyDocument | null> {
    return this.prisma.policyDocument.findFirst({
      where: { kind, active: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  findByKindAndVersion(
    kind: string,
    version: string,
  ): Promise<PolicyDocument | null> {
    return this.prisma.policyDocument.findUnique({
      where: { kind_version: { kind, version } },
    });
  }

  contentFor(document: PolicyDocument): string {
    const content =
      document.kind === 'ACCESS_DISCLOSURE'
        ? (process.env.ACCESS_DISCLOSURE_TEXT ??
          DEVELOPMENT_ACCESS_DISCLOSURE_TEXT)
        : document.kind === 'TERMS_OF_SERVICE'
          ? (process.env.TERMS_OF_SERVICE_TEXT ?? DEVELOPMENT_TERMS_TEXT)
          : null;
    if (
      !content ||
      createHash('sha256').update(content).digest('hex') !==
        document.contentHash
    ) {
      throw new Error(
        `Configured content does not match policy ${document.kind} version ${document.version}`,
      );
    }
    return content;
  }

  async recordAcceptance(
    principalId: string,
    policyDocumentId: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    await this.prisma.policyAcceptance.create({
      data: {
        principalId,
        policyDocumentId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
  }
}
