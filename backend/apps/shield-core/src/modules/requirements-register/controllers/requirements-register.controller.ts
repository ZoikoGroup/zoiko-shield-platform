import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { RequirementsRegisterService } from '../services/requirements-register.service';
import { TraceabilityGraphService } from '../services/traceability-graph.service';
import { RequirementsReconciliationWorker } from '../workers/requirements-reconciliation.worker';
import {
  CreateRequirementDto,
  QueryRequirementsDto,
} from '../dto/requirement.dto';
import { PlatformPermissionsGuard } from '../../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../../authorization/decorators/require-platform-permissions.decorator';

@Controller('api/v1/requirements')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class RequirementsRegisterController {
  constructor(
    private readonly registerService: RequirementsRegisterService,
    private readonly graphService: TraceabilityGraphService,
    private readonly reconciliationWorker: RequirementsReconciliationWorker,
  ) {}

  @Post()
  @RequirePlatformPermissions('requirements:write')
  @HttpCode(HttpStatus.CREATED)
  public createRequirement(@Body() dto: CreateRequirementDto) {
    return this.registerService.registerRequirement(dto);
  }

  @Get()
  @RequirePlatformPermissions('requirements:read')
  public queryRequirements(@Query() query: QueryRequirementsDto) {
    return this.registerService.queryRequirements(query);
  }

  @Get('coverage/report')
  @RequirePlatformPermissions('requirements:read')
  public getCoverageReport() {
    return this.graphService.getTraceabilityCoverage();
  }

  @Get('precedence/hierarchy')
  @RequirePlatformPermissions('requirements:read')
  public getPrecedenceHierarchy() {
    return this.graphService.getPrecedenceHierarchy();
  }

  @Post('reconciliation/run')
  @RequirePlatformPermissions('requirements:admin')
  @HttpCode(HttpStatus.OK)
  public runReconciliation() {
    return this.reconciliationWorker.executeReconciliation();
  }

  @Get(':id')
  @RequirePlatformPermissions('requirements:read')
  public getRequirement(@Param('id') id: string) {
    return this.registerService.getRequirement(id);
  }
}
