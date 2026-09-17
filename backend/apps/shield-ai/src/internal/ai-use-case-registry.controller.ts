import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import {
  AiUseCaseRegistryService,
  AiUseCaseDefinition,
  UseCaseApprovalStatus,
} from '../inventory/ai-use-case-registry.service';

export class UpdateApprovalStatusDto {
  status!: UseCaseApprovalStatus;
}

export class ValidateEligibilityDto {
  requestedModelVersion!: string;
}

export class RegisterUseCaseDto {
  key!: string;
  name!: string;
  owner!: string;
  riskTier!: 'AR-1' | 'AR-2' | 'AR-3';
  approvalStatus!: UseCaseApprovalStatus;
  pinnedModelVersion!: string;
  fallbackEngine!: string;
  humanReviewRequired!: boolean;
  minGroundingScore!: number;
  minCitationPrecision!: number;
  allowedDataClasses!: string[];
}

/**
 * Controller exposing AI Use Case Governance Registry endpoints (AR-1/AR-2/AR-3 risk classification).
 * Specification: ZS-ENG-AI-001 §05 & §18
 */
@Controller('api/v1/ai/governance/use-cases')
export class AiUseCaseRegistryController {
  constructor(private readonly registryService: AiUseCaseRegistryService) {}

  /**
   * GET /api/v1/ai/governance/use-cases
   * List all registered AI use cases with risk tiers and pinned models.
   */
  @Get()
  async listUseCases() {
    const useCases = this.registryService.listUseCases();
    return {
      statusCode: HttpStatus.OK,
      data: {
        total: useCases.length,
        useCases,
      },
    };
  }

  /**
   * GET /api/v1/ai/governance/use-cases/:key
   * Retrieve a specific AI use case definition.
   */
  @Get(':key')
  async getUseCase(@Param('key') key: string) {
    const useCase = this.registryService.getUseCase(key);
    return {
      statusCode: HttpStatus.OK,
      data: useCase,
    };
  }

  /**
   * POST /api/v1/ai/governance/use-cases
   * Register a new AI Use Case under AR-1/AR-2/AR-3 governance.
   */
  @Post()
  async registerUseCase(@Body() dto: RegisterUseCaseDto) {
    const created = this.registryService.registerUseCase(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: created,
    };
  }

  /**
   * PATCH /api/v1/ai/governance/use-cases/:key/status
   * Update the production approval status of an AI use case.
   */
  @Patch(':key/status')
  async updateStatus(
    @Param('key') key: string,
    @Body() dto: UpdateApprovalStatusDto,
  ) {
    const updated = this.registryService.updateApprovalStatus(key, dto.status);
    return {
      statusCode: HttpStatus.OK,
      data: updated,
    };
  }

  /**
   * POST /api/v1/ai/governance/use-cases/:key/validate
   * Validate runtime eligibility against model version and approval status.
   */
  @Post(':key/validate')
  async validateEligibility(
    @Param('key') key: string,
    @Body() dto: ValidateEligibilityDto,
  ) {
    const result = this.registryService.validateExecutionEligibility(
      key,
      dto.requestedModelVersion,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }
}
