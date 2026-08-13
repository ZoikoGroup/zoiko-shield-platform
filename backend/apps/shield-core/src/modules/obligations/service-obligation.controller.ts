import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  ServiceObligationService,
  CreateServiceObligationDto,
} from './service-obligation.service';

export class UpdateObligationStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  evidenceRef?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/obligations')
export class ServiceObligationController {
  constructor(private readonly obligationService: ServiceObligationService) {}

  /**
   * POST /api/v1/obligations
   * Create service obligation
   */
  @Post()
  async createObligation(@Body() dto: CreateServiceObligationDto) {
    const obligation = await this.obligationService.createObligation(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: obligation,
    };
  }

  /**
   * GET /api/v1/obligations
   * Get obligations by contract ID
   */
  @Get()
  async getObligations(@Query('contractId') contractId: string) {
    const obligations =
      await this.obligationService.getObligationsByContract(contractId);
    return {
      statusCode: HttpStatus.OK,
      data: obligations,
    };
  }

  /**
   * PATCH /api/v1/obligations/:id/status
   * Update obligation status and link delivery evidence
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateObligationStatusDto,
  ) {
    const updated = await this.obligationService.updateStatus(
      id,
      dto.status,
      dto.evidenceRef,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Obligation status updated',
      data: updated,
    };
  }
}
