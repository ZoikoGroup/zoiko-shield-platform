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
import { PERMISSION_CODES } from '../../authorization/constants';
import { RequireAssurance } from '../../authorization/decorators/require-assurance.decorator';
import { RequirePlatformPermissions } from '../../authorization/decorators/require-platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateFrameworkDto,
  CreateFrameworkVersionDto,
  DecideAssuranceContentDto,
  FrameworkRegistryService,
  SubmitAssuranceContentDto,
} from './framework-registry.service';

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/assurance/frameworks')
export class FrameworkGovernanceController {
  constructor(private readonly frameworks: FrameworkRegistryService) {}

  @Get()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async list() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.frameworks.listFrameworks(),
    };
  }

  @Post()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async create(@Body() dto: CreateFrameworkDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.frameworks.createFramework(dto),
    };
  }

  @Post('versions')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFrameworkVersionDto,
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.frameworks.createVersion(dto, user.id),
    };
  }

  @Post('versions/:id/submission')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitAssuranceContentDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.frameworks.submitVersion(id, user.id, dto.reason),
    };
  }

  @Patch('versions/:id/decision')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_APPROVE,
  )
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideAssuranceContentDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.frameworks.decideVersion(
        id,
        user.id,
        dto.decision,
        dto.reason,
      ),
    };
  }
}
