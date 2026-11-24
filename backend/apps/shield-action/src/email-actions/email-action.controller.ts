import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import {
  EmailActionAdapterService,
  type EmailActionProposalInput,
  type EmailActionRollbackInput,
} from './email-action-adapter.service';

@Controller('internal/v1/email-actions')
@UseGuards(InternalAuthGuard)
export class EmailActionController {
  constructor(private readonly adapterService: EmailActionAdapterService) {}

  @Post('simulate')
  async simulate(@Body() body: EmailActionProposalInput) {
    const data = await this.adapterService.simulate(body);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('execute')
  async execute(@Body() body: EmailActionProposalInput) {
    const data = await this.adapterService.execute(body);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('rollback')
  async rollback(@Body() body: EmailActionRollbackInput) {
    const data = await this.adapterService.rollback(body);
    return { statusCode: HttpStatus.OK, data };
  }
}
