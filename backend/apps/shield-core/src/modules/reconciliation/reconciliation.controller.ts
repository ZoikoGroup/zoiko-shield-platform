import { Body, Controller, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { ReconciliationService } from './reconciliation.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('runs')
  async startRun(@Body('runType') runType?: string) {
    const run = await this.reconciliationService.startRun(runType);
    return { statusCode: HttpStatus.CREATED, data: run };
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.reconciliationService.getRunById(id);
    return { statusCode: HttpStatus.OK, data: run };
  }

  @Post('runs/:id/checks/contract-entitlement')
  async checkContractEntitlement(@Param('id') id: string) {
    const result = await this.reconciliationService.reconcileContractEntitlement(id);
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('runs/:id/checks/invoice-payments')
  async checkInvoicePayments(@Param('id') id: string) {
    const result = await this.reconciliationService.reconcileInvoicePayments(id);
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Patch('runs/:id/complete')
  async completeRun(@Param('id') id: string) {
    const run = await this.reconciliationService.completeRun(id);
    return { statusCode: HttpStatus.OK, data: run };
  }

  @Patch('issues/:id/resolve')
  async resolveIssue(@Param('id') id: string, @Body('resolution') resolution: string) {
    const issue = await this.reconciliationService.resolveIssue(id, resolution);
    return { statusCode: HttpStatus.OK, data: issue };
  }
}
