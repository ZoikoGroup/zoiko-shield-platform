import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import {
  ClaimRegisterService,
  DecideClaimDto,
  RegisterClaimDto,
  RevokeClaimDto,
} from './claim-register.service';

export class ListClaimsQueryDto {
  @IsOptional()
  @IsString()
  claimKey?: string;

  @IsOptional()
  @IsIn([
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'SUPERSEDED',
    'REVOKED',
    'EXPIRED',
  ])
  status?: string;
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CLAIM_MANAGE)
@Controller('api/v1/commercial/claims')
export class ClaimRegisterController {
  constructor(private readonly claimRegisterService: ClaimRegisterService) {}

  /** Creates a versioned PENDING_APPROVAL proposal; this never self-approves. */
  @Post(['registrations', 'register'])
  async register(
    @Body() dto: RegisterClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const claim = await this.claimRegisterService.registerClaim(dto, user.id);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Claim registration submitted for Legal and Compliance review',
      data: claim,
    };
  }

  @Get('registrations')
  async list(@Query() query: ListClaimsQueryDto) {
    const claims = await this.claimRegisterService.listClaims(
      query.claimKey,
      query.status,
    );
    return { statusCode: HttpStatus.OK, data: claims };
  }

  @Get('registrations/:id')
  async get(@Param('id') id: string) {
    const claim = await this.claimRegisterService.getClaimById(id);
    return { statusCode: HttpStatus.OK, data: claim };
  }

  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CLAIM_LEGAL_APPROVE)
  @Patch('registrations/:id/reviews/legal')
  async legalDecision(
    @Param('id') id: string,
    @Body() dto: DecideClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const claim = await this.claimRegisterService.decideClaim(
      id,
      'LEGAL',
      user.id,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Legal claim review recorded',
      data: claim,
    };
  }

  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_CLAIM_COMPLIANCE_APPROVE,
  )
  @Patch('registrations/:id/reviews/compliance')
  async complianceDecision(
    @Param('id') id: string,
    @Body() dto: DecideClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const claim = await this.claimRegisterService.decideClaim(
      id,
      'COMPLIANCE',
      user.id,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Compliance claim review recorded',
      data: claim,
    };
  }

  @Patch('registrations/:id/revoke')
  async revoke(
    @Param('id') id: string,
    @Body() dto: RevokeClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const claim = await this.claimRegisterService.revokeClaim(
      id,
      user.id,
      dto.reason,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Claim revoked',
      data: claim,
    };
  }
}
