import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EvidenceService, CreateEvidenceDto } from './evidence.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1/evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  /**
   * POST /api/v1/evidence
   * Create an evidence record
   */
  @Post()
  async createEvidence(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateEvidenceDto,
  ) {
    dto.tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const evidence = await this.evidenceService.createEvidence(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Evidence record created with SHA-256 cryptographic hash',
      data: evidence,
    };
  }

  /**
   * GET /api/v1/evidence
   * List evidence records for tenant
   */
  @Get()
  async getEvidenceByTenant(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('caseId') caseId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const records = await this.evidenceService.getEvidenceByTenant(
      tenantId,
      caseId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: records,
    };
  }

  /**
   * GET /api/v1/evidence/:id
   * Get single evidence details
   */
  @Get(':id')
  async getEvidenceById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const evidence = await this.evidenceService.getEvidenceById(
      requireTenantId(headerTenantId),
      id,
    );
    return {
      statusCode: HttpStatus.OK,
      data: evidence,
    };
  }

  /**
   * POST /api/v1/evidence/:id/verify
   * Verify cryptographic integrity of evidence
   */
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEvidenceIntegrity(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const result = await this.evidenceService.verifyEvidenceIntegrity(
      requireTenantId(headerTenantId),
      id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: result.isIntegrityValid
        ? 'Evidence cryptographic integrity VERIFIED'
        : 'CRITICAL: Evidence hash mismatch detected!',
      data: result,
    };
  }
}
