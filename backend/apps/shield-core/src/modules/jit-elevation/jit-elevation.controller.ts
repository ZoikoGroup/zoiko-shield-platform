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
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import {
  JitElevationService,
  CreateJitElevationDto,
  PeerApproveDto,
  HardwareStepUpDto,
  RevokeJitSessionDto,
  JitElevationSession,
} from './jit-elevation.service';

@Controller('api/v1/jit')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class JitElevationController {
  constructor(private readonly jitService: JitElevationService) {}

  @Post('elevate')
  @RequirePlatformPermissions('rbac:manage')
  @HttpCode(HttpStatus.CREATED)
  createElevationRequest(
    @Body() dto: CreateJitElevationDto,
  ): JitElevationSession {
    return this.jitService.createElevationRequest(dto);
  }

  @Get('sessions')
  @RequirePlatformPermissions('rbac:read')
  getSessions(@Query('tenantId') tenantId?: string): {
    sessions: JitElevationSession[];
    total: number;
  } {
    const sessions = this.jitService.getSessions(tenantId);
    return {
      sessions,
      total: sessions.length,
    };
  }

  @Get('sessions/:id')
  @RequirePlatformPermissions('rbac:read')
  getSession(@Param('id') id: string): JitElevationSession {
    return this.jitService.getSession(id);
  }

  @Post('sessions/:id/approve')
  @RequirePlatformPermissions('rbac:manage')
  @HttpCode(HttpStatus.OK)
  peerApprove(
    @Param('id') id: string,
    @Body() dto: PeerApproveDto,
  ): JitElevationSession {
    return this.jitService.peerApprove(id, dto);
  }

  @Post('sessions/:id/step-up')
  @RequirePlatformPermissions('rbac:manage')
  @HttpCode(HttpStatus.OK)
  stepUpHardware(
    @Param('id') id: string,
    @Body() dto: HardwareStepUpDto,
  ): JitElevationSession {
    return this.jitService.stepUpHardware(id, dto);
  }

  @Post('sessions/:id/revoke')
  @RequirePlatformPermissions('rbac:manage')
  @HttpCode(HttpStatus.OK)
  revokeSession(
    @Param('id') id: string,
    @Body() dto: RevokeJitSessionDto,
  ): JitElevationSession {
    return this.jitService.revokeSession(id, dto);
  }
}
