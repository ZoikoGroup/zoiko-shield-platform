import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import {
  EmailActionAdapterService,
  type EmailActionProposalInput,
} from './email-action-adapter.service';

@Controller('internal/v1/email-actions')
@UseGuards(InternalAuthGuard)
export class EmailActionController {
  constructor(private readonly adapterService: EmailActionAdapterService) {}

  @Post('simulate')
  simulate(@Body() body: EmailActionProposalInput) {
    return {
      statusCode: HttpStatus.OK,
      data: this.adapterService.simulate(body),
    };
  }

  @Post('execute')
  async execute(@Body() body: EmailActionProposalInput) {
    const data = await this.adapterService.execute(body);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('rollback')
  rollback(
    @Body()
    body: {
      proposalId: string;
      tenantId: string;
      requestedBy: string;
      targetRefs: string[];
    },
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: this.adapterService.rollback(body),
    };
  }
}
