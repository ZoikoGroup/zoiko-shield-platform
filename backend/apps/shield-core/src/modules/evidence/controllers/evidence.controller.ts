import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Param,
  Headers,
  HttpStatus,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { EvidenceService } from '../services/evidence.service';
import { EvidenceVerificationService } from '../verification/evidence-verification.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../../tenant-context';

/** Minimal shape of a multer upload — avoids pulling in @types/multer for four fields. */
interface UploadedEvidenceFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export class UploadManualEvidenceDto {
  @IsString()
  environmentId!: string;

  @IsString()
  region!: string;

  @IsString()
  evidenceType!: string;

  @IsString()
  purpose!: string;

  /** Why a human is submitting this rather than a collector producing it. */
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsString()
  dataClass?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  /** Accepts 'true'/'false' since multipart form fields arrive as strings. */
  @IsOptional()
  @IsString()
  reviewRequired?: string;
}

export class ManualEvidenceReviewDto {
  @IsOptional()
  @IsString()
  comments?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly verificationService: EvidenceVerificationService,
    private readonly lineageService: EvidenceLineageService,
  ) {}

  private resolveTenantId(headerTenantId: string): string {
    return requireTenantId(headerTenantId);
  }

  /**
   * Human-submitted evidence. Kept on a separate route with mandatory
   * uploader identity and reason so it can never be mistaken for automated
   * collection (ZS-ENG-EVID-001 §08) — the bytes still go through the same
   * hash, vault and ledger path as everything else.
   */
  @Post('manual')
  @UseInterceptors(FileInterceptor('file'))
  async uploadManual(
    @Headers('x-tenant-id') headerTenantId: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
    @Body() dto: UploadManualEvidenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty file upload is required');
    }

    const evidence = await this.evidenceService.createEvidence({
      tenantId,
      environmentId: dto.environmentId,
      region: dto.region,
      evidenceType: dto.evidenceType,
      // The submitter is the provenance here, not a collector service.
      producingService: `manual-upload:${user.email ?? user.id}`,
      sourceSystemId: 'manual-upload',
      sourceObjectId: file.originalname,
      purpose: dto.purpose,
      dataClass: dto.dataClass,
      rawContent: file.buffer,
      mediaType: file.mimetype,
      caseId: dto.caseId,
      addedBy: user.id,
      collectionMethod: 'MANUAL',
      uploaderIdentity: user.id,
      uploadReason: dto.reason,
      manualReviewRequired: dto.reviewRequired !== 'false',
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    return { statusCode: HttpStatus.CREATED, data: evidence };
  }

  @Post(':evidenceId/manual-review')
  async reviewManual(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() dto: ManualEvidenceReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const reviewed = await this.evidenceService.recordManualReview({
      tenantId,
      evidenceId,
      reviewerId: user.id,
      comments: dto.comments,
    });
    return { statusCode: HttpStatus.OK, data: reviewed };
  }

  @Get(':evidenceId')
  async getById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    // Cross-tenant access must be rejected, not merely filtered — see EvidenceService.assertTenantOwnership.
    await this.evidenceService.assertTenantOwnership(tenantId, evidenceId);
    const evidence = await this.evidenceService.getById(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: evidence };
  }

  @Get(':evidenceId/lineage')
  async getLineage(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.evidenceService.assertTenantOwnership(tenantId, evidenceId);
    const lineage = await this.lineageService.reconstruct(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: lineage };
  }

  @Post(':evidenceId/verify')
  async verify(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const result = await this.verificationService.verify(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: result };
  }
}
