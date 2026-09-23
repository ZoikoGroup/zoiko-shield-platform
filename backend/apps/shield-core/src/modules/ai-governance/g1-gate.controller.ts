import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { G1GateService } from './g1-gate.service';

export interface SignG1RosterDto {
  roleId: string;
  signatoryName: string;
  signatureProof: string;
  evidenceNotes?: string;
}

@Controller('api/v1/governance/g1-roster')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class G1GateController {
  constructor(private readonly g1GateService: G1GateService) {}

  @Get()
  @RequirePlatformPermissions('governance:read')
  public getRosterStatus() {
    return this.g1GateService.getRosterStatus();
  }

  @Post('sign')
  @RequirePlatformPermissions('governance:admin')
  @HttpCode(HttpStatus.OK)
  public recordSignature(@Body() dto: SignG1RosterDto) {
    return this.g1GateService.recordSignature(dto);
  }

  @Post('reset')
  @RequirePlatformPermissions('governance:admin')
  @HttpCode(HttpStatus.OK)
  public resetRoster() {
    this.g1GateService.resetRoster();
    return this.g1GateService.getRosterStatus();
  }
}
