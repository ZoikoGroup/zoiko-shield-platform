import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IsISO8601, IsObject, IsString, IsUUID } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import * as crypto from 'crypto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['QUOTED'],
  QUOTED: ['ORDERED', 'DRAFT'],
  ORDERED: ['ACTIVE'],
  ACTIVE: ['PAST_DUE', 'CANCEL_AT_TERM'],
  PAST_DUE: ['RESTRICTED', 'ACTIVE'],
  RESTRICTED: ['SUSPENDED', 'ACTIVE'],
  SUSPENDED: ['TERMINATION_WORKFLOW', 'ACTIVE'],
  CANCEL_AT_TERM: ['TERMINATED'],
  TERMINATION_WORKFLOW: ['TERMINATED'],
  TERMINATED: [],
};

export class CreateContractDto {
  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  catalogVersionId!: string;

  @IsISO8601()
  termStart!: Date;

  @IsISO8601()
  termEnd!: Date;

  @IsObject()
  orderConfig!: Record<string, any>;
}

@Injectable()
export class ContractStateService {
  private readonly logger = new Logger(ContractStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Create new contract in DRAFT state. Accepts an optional transaction
   * client so callers (e.g. OrderService.provisionOrder) can fold contract
   * creation into a single atomic transaction with sibling writes.
   */
  async createContract(dto: CreateContractDto, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const configString = JSON.stringify(dto.orderConfig);
    const snapshotHash = crypto
      .createHash('sha256')
      .update(configString)
      .digest('hex');

    return client.contract.create({
      data: {
        commercial_account_id: dto.commercialAccountId,
        catalog_version_id: dto.catalogVersionId,
        term_start: dto.termStart,
        term_end: dto.termEnd,
        status: 'DRAFT',
        snapshot_hash: snapshotHash,
      },
    });
  }

  /**
   * Get contract by ID
   */
  async getContractById(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        commercialAccount: true,
        catalogVersion: true,
        serviceObligations: true,
        commercialInvoices: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract '${contractId}' not found`);
    }

    return contract;
  }

  /**
   * Transition contract state per Section 28 rules.
   * Atomically records a CommercialEvent outbox row.
   */
  async transitionState(
    contractId: string,
    targetStatus: string,
    actor = 'system',
    idempotencyKey?: string,
  ) {
    const doTransition = async () => {
      const contract = await this.getContractById(contractId);
      const currentStatus = contract.status;

      const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        throw new ConflictException(
          `Illegal contract transition from '${currentStatus}' to '${targetStatus}'`,
        );
      }

      // Execute state transition and outbox entry in single transaction
      return this.prisma.$transaction(async (tx) => {
        const updatedContract = await tx.contract.update({
          where: { id: contractId },
          data: { status: targetStatus },
        });

        await tx.commercialEvent.create({
          data: {
            event_type: 'contract.state_changed',
            tenant_id: contract.commercial_account_id,
            actor,
            payload: JSON.stringify({
              contractId,
              previousStatus: currentStatus,
              newStatus: targetStatus,
              updatedAt: new Date(),
            }),
            idempotency_key: `contract-transition-${contractId}-${targetStatus}-${Date.now()}-${crypto.randomUUID()}`,
          },
        });

        return updatedContract;
      });
    };

    if (!idempotencyKey) {
      return doTransition();
    }

    // ZS-COM-BILL-001 Part 4: same key + same request replays the prior
    // response; same key + different request is a 409, never a raw
    // unique-constraint error.
    const result = await this.idempotencyService.run(
      {
        key: idempotencyKey,
        operation: 'commerce.contract.transition',
        actorId: actor,
        requestPayload: { contractId, targetStatus },
      },
      async () => ({ statusCode: 200, body: await doTransition() }),
    );

    return result.body;
  }
}
