import { Body, Controller, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CreateDunningPolicyDto, DunningPolicyService } from './dunning-policy.service';
import { DunningService, TriggerDunningDto } from './dunning.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/dunning/policies')
export class DunningPolicyController {
  constructor(private readonly policyService: DunningPolicyService) {}

  @Post()
  async create(@Body() dto: CreateDunningPolicyDto) {
    const policy = await this.policyService.createPolicy(dto);
    return { statusCode: HttpStatus.CREATED, data: policy };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    const policy = await this.policyService.approvePolicy(id, approvedBy || 'system');
    return { statusCode: HttpStatus.OK, data: policy };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/dunning/cases')
export class DunningCaseController {
  constructor(private readonly dunningService: DunningService) {}

  @Post()
  async trigger(@Body() dto: TriggerDunningDto) {
    const dunningCase = await this.dunningService.triggerDunning(dto);
    return { statusCode: HttpStatus.CREATED, data: dunningCase };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const dunningCase = await this.dunningService.getCaseById(id);
    return { statusCode: HttpStatus.OK, data: dunningCase };
  }

  @Patch(':id/advance')
  async advance(@Param('id') id: string) {
    const result = await this.dunningService.advanceDunning(id);
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Patch(':id/resolve')
  async resolve(@Param('id') id: string, @Body('actor') actor?: string) {
    const dunningCase = await this.dunningService.resolveDunning(id, actor);
    return { statusCode: HttpStatus.OK, data: dunningCase };
  }
}
