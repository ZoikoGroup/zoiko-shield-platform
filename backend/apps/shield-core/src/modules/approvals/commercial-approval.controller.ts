import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  CommercialApprovalService,
  RequestApprovalDto,
} from './commercial-approval.service';

export class DecideApprovalDto {
  @IsString()
  approverId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/approvals')
export class CommercialApprovalController {
  constructor(private readonly approvalService: CommercialApprovalService) {}

  @Post()
  async requestApproval(@Body() dto: RequestApprovalDto) {
    const approval = await this.approvalService.requestApproval(dto);
    return { statusCode: HttpStatus.CREATED, data: approval };
  }

  @Get(':id')
  async getApproval(@Param('id') id: string) {
    const approval = await this.approvalService.getApprovalById(id);
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Patch(':id/decision')
  async decide(@Param('id') id: string, @Body() dto: DecideApprovalDto) {
    const approval = await this.approvalService.decideApproval(
      id,
      dto.approverId,
      dto.decision,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }
}
