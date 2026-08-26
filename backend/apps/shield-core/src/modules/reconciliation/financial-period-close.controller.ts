import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  CloseFinancialPeriodDto,
  FinancialPeriodCloseService,
  RequestEmergencyOverrideDto,
} from './financial-period-close.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/period-close')
export class FinancialPeriodCloseController {
  constructor(
    private readonly periodCloseService: FinancialPeriodCloseService,
  ) {}

  /**
   * GET /api/v1/commercial/period-close/list
   * List financial period close records and override audit logs.
   */
  @Get('list')
  async listPeriods() {
    const data = await this.periodCloseService.listPeriodStatuses();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/commercial/period-close/lock
   * Lock a financial period with dual-control sign-off.
   */
  @Post('lock')
  async closePeriod(
    @Body() dto: CloseFinancialPeriodDto,
    @Headers('x-actor-id') actorId = 'finance-admin',
  ) {
    const data = await this.periodCloseService.closePeriod(dto, actorId);
    return {
      statusCode: HttpStatus.OK,
      message: `Financial period '${dto.periodKey}' has been locked`,
      data,
    };
  }

  /**
   * POST /api/v1/commercial/period-close/emergency-override
   * Request emergency override for a locked financial period.
   */
  @Post('emergency-override')
  async requestOverride(
    @Body() dto: RequestEmergencyOverrideDto,
    @Headers('x-actor-id') actorId = 'finance-admin',
  ) {
    const data = await this.periodCloseService.requestEmergencyOverride(
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Emergency override requested, pending dual-control approval',
      data,
    };
  }
}
