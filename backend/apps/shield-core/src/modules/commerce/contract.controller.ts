import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { ContractStateService, CreateContractDto } from './contract-state.service';

export class TransitionContractDto {
  targetStatus!: string;
  actor?: string;
}

@Controller('api/v1/commerce/contracts')
export class ContractController {
  constructor(private readonly contractService: ContractStateService) {}

  /**
   * POST /api/v1/commerce/contracts
   * Create new contract in DRAFT state
   */
  @Post()
  async createContract(@Body() dto: CreateContractDto) {
    const contract = await this.contractService.createContract(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: contract,
    };
  }

  /**
   * GET /api/v1/commerce/contracts/:id
   * Get contract details
   */
  @Get(':id')
  async getContractById(@Param('id') id: string) {
    const contract = await this.contractService.getContractById(id);
    return {
      statusCode: HttpStatus.OK,
      data: contract,
    };
  }

  /**
   * PATCH /api/v1/commerce/contracts/:id/transition
   * Transition contract status per Section 28 transition matrix
   */
  @Patch(':id/transition')
  async transitionState(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: TransitionContractDto,
  ) {
    const contract = await this.contractService.transitionState(
      id,
      dto.targetStatus,
      dto.actor || 'system',
      idempotencyKey,
    );
    return {
      statusCode: HttpStatus.OK,
      message: `Contract status updated to '${dto.targetStatus}'`,
      data: contract,
    };
  }
}
