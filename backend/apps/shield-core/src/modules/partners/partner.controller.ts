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
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  CreatePartnerDto,
  CreatePartnerAgreementDto,
  PartnerService,
} from './partner.service';
import {
  GrantDelegationDto,
  PartnerDelegationService,
} from './partner-delegation.service';
import {
  CalculateSettlementDto,
  PartnerSettlementService,
} from './partner-settlement.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Post()
  async create(@Body() dto: CreatePartnerDto) {
    const partner = await this.partnerService.createPartner(dto);
    return { statusCode: HttpStatus.CREATED, data: partner };
  }

  @Post('agreements')
  async createAgreement(@Body() dto: CreatePartnerAgreementDto) {
    const agreement = await this.partnerService.createAgreement(dto);
    return { statusCode: HttpStatus.CREATED, data: agreement };
  }

  @Patch('agreements/:id/approve')
  async approveAgreement(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    const agreement = await this.partnerService.approveAgreement(
      id,
      approvedBy || 'system',
    );
    return { statusCode: HttpStatus.OK, data: agreement };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/partners/delegations')
export class PartnerDelegationController {
  constructor(private readonly delegationService: PartnerDelegationService) {}

  @Post()
  async grant(@Body() dto: GrantDelegationDto) {
    const delegation = await this.delegationService.grantDelegation(dto);
    return { statusCode: HttpStatus.CREATED, data: delegation };
  }

  @Patch(':id/revoke')
  async revoke(@Param('id') id: string) {
    const delegation = await this.delegationService.revoke(id);
    return { statusCode: HttpStatus.OK, data: delegation };
  }

  @Get('check')
  async check(
    @Query('partnerId') partnerId: string,
    @Query('commercialAccountId') commercialAccountId: string,
    @Query('scope') scope: string,
  ) {
    const allowed = await this.delegationService.checkDelegation(
      partnerId,
      commercialAccountId,
      scope,
    );
    return { statusCode: HttpStatus.OK, data: { allowed } };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/partners/settlements')
export class PartnerSettlementController {
  constructor(private readonly settlementService: PartnerSettlementService) {}

  @Post()
  async calculate(@Body() dto: CalculateSettlementDto) {
    const settlement = await this.settlementService.calculateSettlement(dto);
    return { statusCode: HttpStatus.CREATED, data: settlement };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const settlement = await this.settlementService.getSettlementById(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    const settlement = await this.settlementService.approveSettlement(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }

  @Patch(':id/mark-paid')
  async markPaid(@Param('id') id: string) {
    const settlement = await this.settlementService.markPaid(id);
    return { statusCode: HttpStatus.OK, data: settlement };
  }
}
