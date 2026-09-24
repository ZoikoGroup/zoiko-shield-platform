import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SyntheticJourneyService } from './synthetic-journey.service';
import { GameDayRunnerService, GameDayScenario } from './game-day-runner.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';

@Controller('api/v1/observability/synthetic')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class SyntheticObservabilityController {
  constructor(
    private readonly syntheticJourneyService: SyntheticJourneyService,
    private readonly gameDayRunnerService: GameDayRunnerService,
  ) {}

  @Get('status')
  @RequirePlatformPermissions('observability:read')
  public getSyntheticStatus(@Query('canaryTenantId') canaryTenantId?: string) {
    const tenant = canaryTenantId || 'tenant-zoiko-canary-01';
    const canaryPosture = this.syntheticJourneyService.getCanaryPosture(tenant);
    const gameDayPosture = this.gameDayRunnerService.getGameDayPosture();
    const recentProbes = this.syntheticJourneyService.getProbeHistory(tenant).slice(0, 10);
    const recentExercises = this.gameDayRunnerService.getExerciseHistory().slice(0, 10);

    return {
      canaryPosture,
      gameDayPosture,
      recentProbes,
      recentExercises,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('probe')
  @RequirePlatformPermissions('observability:write')
  public triggerSyntheticProbe(
    @Body() body: { canaryTenantId?: string; region?: string },
  ) {
    const tenant = body.canaryTenantId || 'tenant-zoiko-canary-01';
    const region = body.region || 'eu-west-1';
    return this.syntheticJourneyService.executeJourneyProbe(tenant, region);
  }

  @Post('gameday/execute')
  @RequirePlatformPermissions('observability:write')
  public triggerGameDayExercise(
    @Body() body: { scenario: GameDayScenario; exercisedBy?: string },
  ) {
    const actor = body.exercisedBy || 'operator@zoiko.com';
    return this.gameDayRunnerService.executeGameDayExercise(body.scenario, actor);
  }

  @Get('gameday/annex-p/:exerciseId')
  @RequirePlatformPermissions('observability:read')
  public getAnnexPReport(@Param('exerciseId') exerciseId: string) {
    return this.gameDayRunnerService.generateAnnexPReport(exerciseId);
  }
}
