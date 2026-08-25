import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CommercialApprovalService } from '../../approvals/commercial-approval.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';

export class CreateFrameworkDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsString()
  version!: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;
}

export class CreateFrameworkVersionDto {
  @IsString()
  frameworkId!: string;

  @IsString()
  version!: string;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsObject()
  content!: Record<string, unknown>;

  @IsString()
  sourceReference!: string;

  @IsString()
  sourceVersion!: string;

  @IsString()
  licenseReference!: string;

  @IsBoolean()
  displayRights!: boolean;

  @IsString()
  legalInterpretationRef!: string;

  @IsString()
  smeReviewRef!: string;

  @IsString()
  mappingTestReportRef!: string;

  @IsString()
  approvedClaimWording!: string;
}

export class SubmitAssuranceContentDto {
  @IsString()
  reason!: string;
}

export class DecideAssuranceContentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

/** F1 content authority: source, rights, review, tests, wording, then approval. */
@Injectable()
export class FrameworkRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} must be non-empty`);
    }
    return normalized;
  }

  async createFramework(input: CreateFrameworkDto) {
    return this.prisma.framework.create({
      data: {
        id: randomUUID(),
        key: this.required(input.key, 'key'),
        name: this.required(input.name, 'name'),
        version: this.required(input.version, 'version'),
        edition: input.edition?.trim(),
        publisher: input.publisher?.trim(),
        status: 'ACTIVE',
        effective_from: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : undefined,
      },
    });
  }

  listFrameworks() {
    return this.prisma.framework.findMany({
      include: { versions: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async createVersion(input: CreateFrameworkVersionDto, requestedBy: string) {
    const framework = await this.prisma.framework.findUnique({
      where: { id: input.frameworkId },
    });
    if (!framework || framework.status !== 'ACTIVE') {
      throw new ConflictException(
        'Framework versions require an ACTIVE framework record',
      );
    }
    if (!input.displayRights) {
      throw new BadRequestException(
        'Framework content cannot be prepared for release without display rights',
      );
    }
    if (!input.content || Object.keys(input.content).length === 0) {
      throw new BadRequestException('Framework content must be non-empty');
    }
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('effectiveFrom must be valid');
    }
    const { contentHash } = this.hashService.hashCanonicalJson(input.content);
    return this.prisma.frameworkVersion.create({
      data: {
        id: randomUUID(),
        framework_id: framework.id,
        version: this.required(input.version, 'version'),
        effective_from: effectiveFrom,
        content_hash: contentHash,
        source_reference: this.required(
          input.sourceReference,
          'sourceReference',
        ),
        source_version: this.required(input.sourceVersion, 'sourceVersion'),
        content_license_status: 'LICENSED',
        license_reference: this.required(
          input.licenseReference,
          'licenseReference',
        ),
        display_rights: true,
        legal_interpretation_ref: this.required(
          input.legalInterpretationRef,
          'legalInterpretationRef',
        ),
        sme_review_ref: this.required(input.smeReviewRef, 'smeReviewRef'),
        mapping_test_status: 'PASSED',
        mapping_test_report_ref: this.required(
          input.mappingTestReportRef,
          'mappingTestReportRef',
        ),
        approved_claim_wording: this.required(
          input.approvedClaimWording,
          'approvedClaimWording',
        ),
        release_status: 'DRAFT',
        status: 'DRAFT',
        requested_by: requestedBy,
      },
    });
  }

  private async requireVersion(id: string) {
    const version = await this.prisma.frameworkVersion.findUnique({
      where: { id },
      include: { framework: true },
    });
    if (!version) {
      throw new NotFoundException(`FrameworkVersion '${id}' not found`);
    }
    return version;
  }

  private assertReleaseEvidence(
    version: Awaited<ReturnType<FrameworkRegistryService['requireVersion']>>,
  ) {
    if (
      version.content_license_status !== 'LICENSED' ||
      !version.display_rights ||
      version.mapping_test_status !== 'PASSED' ||
      !version.source_reference?.trim() ||
      !version.source_version?.trim() ||
      !version.license_reference?.trim() ||
      !version.legal_interpretation_ref?.trim() ||
      !version.sme_review_ref?.trim() ||
      !version.mapping_test_report_ref?.trim() ||
      !version.approved_claim_wording?.trim()
    ) {
      throw new ConflictException(
        'Framework release requires approved source/version, licensing/display rights, legal and SME interpretation, mapping tests, and claim wording',
      );
    }
  }

  async submitVersion(
    frameworkVersionId: string,
    requestedBy: string,
    reason: string,
  ) {
    const version = await this.requireVersion(frameworkVersionId);
    if (version.release_status !== 'DRAFT' || version.approval_id) {
      throw new ConflictException(
        `FrameworkVersion '${frameworkVersionId}' is not a DRAFT release`,
      );
    }
    this.assertReleaseEvidence(version);
    const releaseReason = this.required(reason, 'reason');
    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'ASSURANCE_CONTENT_RELEASE',
          objectType: 'FrameworkVersion',
          objectId: version.id,
          requestedBy,
          reason: releaseReason,
          proposedSnapshot: {
            frameworkKey: version.framework.key,
            version: version.version,
            sourceReference: version.source_reference,
            sourceVersion: version.source_version,
            licenseReference: version.license_reference,
            displayRights: version.display_rights,
            legalInterpretationRef: version.legal_interpretation_ref,
            smeReviewRef: version.sme_review_ref,
            mappingTestReportRef: version.mapping_test_report_ref,
            approvedClaimWording: version.approved_claim_wording,
            contentHash: version.content_hash,
          },
          requiredApprovalRole: 'ASSURANCE_CONTENT_APPROVER',
        },
        tx,
      );
      return tx.frameworkVersion.update({
        where: { id: version.id },
        data: {
          release_status: 'PENDING_APPROVAL',
          approval_id: approval.id,
          requested_by: requestedBy,
        },
      });
    });
  }

  async decideVersion(
    frameworkVersionId: string,
    approvedBy: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('decision must be APPROVED or REJECTED');
    }
    const version = await this.requireVersion(frameworkVersionId);
    if (version.release_status !== 'PENDING_APPROVAL' || !version.approval_id) {
      throw new ConflictException(
        `FrameworkVersion '${frameworkVersionId}' has no pending release approval`,
      );
    }
    this.assertReleaseEvidence(version);
    await this.approvals.decideApproval(
      version.approval_id,
      approvedBy,
      decision,
      reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.frameworkVersion.update({
        where: { id: version.id },
        data:
          decision === 'APPROVED'
            ? {
                release_status: 'APPROVED',
                status: 'PUBLISHED',
                approved_by: approvedBy,
                approved_at: new Date(),
              }
            : { release_status: 'REJECTED', status: 'DRAFT' },
      });
      if (decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: version.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async publishVersion(frameworkVersionId: string) {
    const version = await this.requireVersion(frameworkVersionId);
    if (
      version.status !== 'PUBLISHED' ||
      version.release_status !== 'APPROVED'
    ) {
      throw new ConflictException(
        'Direct publication is prohibited; complete the governed release approval',
      );
    }
    return version;
  }

  async getPublishedVersion(frameworkVersionId: string) {
    const version = await this.requireVersion(frameworkVersionId);
    if (
      version.status !== 'PUBLISHED' ||
      version.release_status !== 'APPROVED'
    ) {
      throw new NotFoundException(
        `FrameworkVersion '${frameworkVersionId}' is not released`,
      );
    }
    return version;
  }
}
