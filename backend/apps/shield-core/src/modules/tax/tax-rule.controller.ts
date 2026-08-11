import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CreateTaxRuleDto, TaxRuleService } from './tax-rule.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/tax/rules')
export class TaxRuleController {
  constructor(private readonly taxRuleService: TaxRuleService) {}

  @Post()
  async create(@Body() dto: CreateTaxRuleDto) {
    const rule = await this.taxRuleService.createRule(dto);
    return { statusCode: HttpStatus.CREATED, data: rule };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    const rule = await this.taxRuleService.approveRule(id, approvedBy || 'system');
    return { statusCode: HttpStatus.OK, data: rule };
  }

  @Get('resolve')
  async resolve(
    @Query('jurisdiction') jurisdiction: string,
    @Query('productTaxClass') productTaxClass: string,
    @Query('taxableAmount') taxableAmount: string,
  ) {
    const result = await this.taxRuleService.resolveTax(
      jurisdiction,
      productTaxClass,
      Number(taxableAmount || 0),
    );
    return { statusCode: HttpStatus.OK, data: result };
  }
}
