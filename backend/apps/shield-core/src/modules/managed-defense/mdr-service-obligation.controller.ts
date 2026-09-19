import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicEndpoint } from '../../security/endpoint-access.decorator';
import {
  MdrServiceObligationService,
  RegisterObligationDto,
  VerifyReadinessDto,
} from './mdr-service-obligation.service';
import { MdrServiceObligation } from './mdr-service-obligation.entity';

@Controller('api/v1/managed-defense/service-obligations')
@PublicEndpoint()
export class MdrServiceObligationController {
  constructor(
    private readonly obligationService: MdrServiceObligationService,
  ) {}

  @Get(':contractId')
  getObligation(
    @Param('contractId') contractId: string,
  ): { data: MdrServiceObligation } {
    return { data: this.obligationService.getObligation(contractId) };
  }

  @Get(':contractId/verify-claim')
  verifyClaim(
    @Param('contractId') contractId: string,
  ): { contractId: string; claimPermitted: boolean } {
    try {
      this.obligationService.assert24x7ClaimPermitted(contractId);
      return { contractId, claimPermitted: true };
    } catch {
      return { contractId, claimPermitted: false };
    }
  }

  @Post('register')
  registerObligation(
    @Body() body: RegisterObligationDto,
  ): { data: MdrServiceObligation } {
    return { data: this.obligationService.registerObligation(body) };
  }

  @Post('verify-readiness')
  verifyReadiness(
    @Body() body: VerifyReadinessDto,
  ): { data: MdrServiceObligation } {
    return { data: this.obligationService.verifyOperationalReadiness(body) };
  }
}
