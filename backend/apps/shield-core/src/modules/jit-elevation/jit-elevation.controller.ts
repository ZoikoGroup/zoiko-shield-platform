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
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  JitElevationService,
  CreateJitElevationDto,
  PeerApproveDto,
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
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJitElevationDto,
  ): JitElevationSession {
    // The requester is the authenticated operator, never a body field.
    return this.jitService.createElevationRequest({
      ...dto,
      operatorId: user.id,
    });
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PeerApproveDto,
  ): JitElevationSession {
    // A body-supplied approverId let one operator approve their own request.
    return this.jitService.peerApprove(id, { ...dto, approverId: user.id });
  }

  /**
   * The step-up is the session's own verified passkey assertion (POST
   * /auth/passkeys/step-up raises it to PASSKEY assurance); a client-sent
   * digest proves nothing and is ignored.
   */
  @Post('sessions/:id/step-up')
  @RequirePlatformPermissions('rbac:manage')
  @RequireAssurance('PASSKEY')
  @HttpCode(HttpStatus.OK)
  stepUpHardware(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): JitElevationSession {
    return this.jitService.stepUpHardware(id, user.id);
  }

  @Post('sessions/:id/revoke')
  @RequirePlatformPermissions('rbac:manage')
  @HttpCode(HttpStatus.OK)
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RevokeJitSessionDto,
  ): JitElevationSession {
    return this.jitService.revokeSession(id, { ...dto, revokedBy: user.id });
  }
}
