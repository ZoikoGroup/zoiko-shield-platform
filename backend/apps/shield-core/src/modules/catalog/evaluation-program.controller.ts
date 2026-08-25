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
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  ConvertEvaluationProgramDto,
  CreateEvaluationProgramDto,
  DecideEvaluationProgramDto,
  EvaluationProgramService,
  SubmitEvaluationProgramDto,
} from './evaluation-program.service';

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CATALOG_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/evaluation-programs')
export class EvaluationProgramController {
  constructor(private readonly programs: EvaluationProgramService) {}

  @Post()
  async create(
    @Body() dto: CreateEvaluationProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const program = await this.programs.createProgram(dto, user.id);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Governed evaluation program created in DRAFT',
      data: program,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.programs.getProgram(id),
    };
  }

  @Post(':id/submit')
  async submit(
    @Param('id') id: string,
    @Body() dto: SubmitEvaluationProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const approval = await this.programs.submitProgram(id, user.id, dto.reason);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Program submitted for independent approval',
      data: approval,
    };
  }

  @Patch(':id/decision')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_PRICE_APPROVE)
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideEvaluationProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const approval = await this.programs.decideProgram(id, user.id, dto);
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const program = await this.programs.activateProgram(id, user.id);
    return { statusCode: HttpStatus.OK, data: program };
  }

  @Post(':id/convert')
  async convert(
    @Param('id') id: string,
    @Body() dto: ConvertEvaluationProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const program = await this.programs.convertProgram(
      id,
      dto.orderId,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: program };
  }
}
