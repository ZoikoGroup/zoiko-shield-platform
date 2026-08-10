import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { ActivateKillSwitchDto, CommercialKillSwitchService } from './commercial-kill-switch.service';
import type { KillSwitchAction } from './commercial-kill-switch.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/commercial/kill-switch')
export class CommercialKillSwitchController {
  constructor(private readonly killSwitchService: CommercialKillSwitchService) {}

  @Post()
  async activate(@Body() dto: ActivateKillSwitchDto) {
    const killSwitch = await this.killSwitchService.activate(dto);
    return { statusCode: HttpStatus.CREATED, data: killSwitch };
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string, @Body('deactivatedBy') deactivatedBy: string) {
    const killSwitch = await this.killSwitchService.deactivate(id, deactivatedBy || 'system');
    return { statusCode: HttpStatus.OK, data: killSwitch };
  }

  @Get('check')
  async check(
    @Query('action') action: KillSwitchAction,
    @Query('scopeType') scopeType?: string,
    @Query('scopeValue') scopeValue?: string,
  ) {
    const blocked = await this.killSwitchService.isBlocked(action, scopeType, scopeValue);
    return { statusCode: HttpStatus.OK, data: { action, blocked } };
  }
}
