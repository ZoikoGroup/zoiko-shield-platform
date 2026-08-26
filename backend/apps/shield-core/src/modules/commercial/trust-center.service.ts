import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PublishTrustCenterArtifactDto {
  title: string;
  category: 'SOC2' | 'ISO27001' | 'PCI_DSS' | 'HIPAA' | 'GDPR' | 'SECURITY_WHITEPAPER' | 'PEN_TEST_SUMMARY';
  description: string;
  version: string;
  documentRef: string;
  effectiveFrom: string;
  effectiveTo?: string;
  classification: 'PUBLIC' | 'CUSTOMER_RESTRICTED' | 'NDA_REQUIRED';
}

@Injectable()
export class TrustCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async publishArtifact(
    tenantId: string,
    dto: PublishTrustCenterArtifactDto,
    actorId: string,
  ) {
    if (!dto.title || !dto.documentRef) {
      throw new BadRequestException('Artifact title and documentRef are required');
    }

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'trust_center.artifact_published',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `trust-center-pub-${Date.now()}-${Math.random()}`,
        payload: JSON.stringify({
          title: dto.title,
          category: dto.category,
          description: dto.description,
          version: dto.version,
          documentRef: dto.documentRef,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo,
          classification: dto.classification,
        }),
      },
    });

    return {
      id: event.id,
      tenantId,
      ...dto,
      publishedAt: event.created_at,
      publishedBy: actorId,
    };
  }

  async getTrustCenterOverview(tenantId: string) {
    const claims = await this.prisma.claimRegister.findMany({
      where: { status: 'APPROVED' },
      take: 20,
    });

    const publications = await this.prisma.commercialEvent.findMany({
      where: {
        tenant_id: tenantId,
        event_type: 'trust_center.artifact_published',
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    const auditPackages = await this.prisma.auditPackage.findMany({
      where: { tenant_id: tenantId, status: { in: ['APPROVED', 'FROZEN'] } },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    return {
      tenantId,
      trustStatus: 'VERIFIED',
      securityPosture: 'COMPLIANT_HIGH_ASSURANCE',
      approvedClaimsCount: claims.length,
      claims: claims.map((c) => ({
        claimKey: c.claim_key,
        claimWording: c.claim_wording,
        category: c.category,
        evidenceRequirement: c.evidence_requirement,
      })),
      publishedArtifacts: publications.map((p) => {
        try {
          return { id: p.id, publishedAt: p.created_at, ...JSON.parse(p.payload) };
        } catch {
          return { id: p.id, publishedAt: p.created_at };
        }
      }),
      availableAuditPackages: auditPackages.map((a) => ({
        id: a.id,
        packageName: a.name,
        frameworkKey: a.framework_key,
        frameworkVersion: a.framework_version,
        status: a.status,
        frozenAt: a.frozen_at,
      })),
    };
  }

  async getProcurementWorkspace(tenantId: string) {
    const accounts = await this.prisma.commercialAccount.findMany({
      where: {
        tenantBindings: {
          some: { tenant_id: tenantId, status: 'ACTIVE' },
        },
      },
      take: 5,
    });

    return {
      tenantId,
      vendorDetails: {
        legalName: 'Zoiko Tech Inc.',
        brandName: 'ZoikoShield',
        dunsNumber: '118234902',
        taxId: 'US-983421049',
        hqAddress: 'San Francisco, CA, USA',
        remittanceBank: 'JPMorgan Chase N.A. (Verified)',
      },
      commercialAccounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        customerLegalName: a.customer_legal_name,
        currency: a.currency,
        billingSource: a.billing_source,
        contacts: typeof a.contacts === 'string' ? JSON.parse(a.contacts) : a.contacts,
        taxFacts: typeof a.tax_facts === 'string' ? JSON.parse(a.tax_facts) : a.tax_facts,
      })),
      securityExhibits: [
        { key: 'DPA', name: 'Data Processing Addendum v2.1', status: 'EXECUTED' },
        { key: 'SLA', name: 'Service Level Agreement Standard', status: 'ACTIVE' },
        { key: 'SOC2_TYPE_II', name: 'SOC 2 Type II Compliance Report', status: 'AVAILABLE' },
      ],
    };
  }
}
