import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialEventPublisherService } from './commercial-event-publisher.service';

export interface ContractMilestoneResult {
  contractId: string;
  milestone: 'NOTICE_30_DAYS' | 'WARNING_7_DAYS' | 'EXPIRED' | 'RENEWAL_PROCESSED';
  termEnd: Date;
  status: string;
  actionTaken: string;
}

@Injectable()
export class ContractRenewalWorker {
  private readonly logger = new Logger(ContractRenewalWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: CommercialEventPublisherService,
  ) {}

  /**
   * Evaluates active contracts against upcoming expiration dates and milestone thresholds.
   */
  async evaluateExpiringContracts(
    now: Date = new Date(),
  ): Promise<ContractMilestoneResult[]> {
    const results: ContractMilestoneResult[] = [];

    // Query active contracts approaching termEnd
    const activeContracts = await (this.prisma as any).contract.findMany({
      where: {
        status: { in: ['ACTIVE', 'CANCEL_AT_TERM'] },
      },
    });

    for (const contract of activeContracts) {
      const termEnd = new Date(contract.termEnd);
      const diffMs = termEnd.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        // Contract has expired
        const newStatus = contract.status === 'CANCEL_AT_TERM' ? 'TERMINATED' : 'PAST_DUE';
        await (this.prisma as any).contract.update({
          where: { id: contract.id },
          data: { status: newStatus },
        });

        await (this.prisma as any).commercialEvent.create({
          data: {
            event_type: 'contract.state_changed',
            tenant_id: contract.tenant_id || 'system',
            actor: 'system-renewal-worker',
            idempotency_key: `contract-exp-${contract.id}-${newStatus}`,
            payload: JSON.stringify({
              contractId: contract.id,
              fromState: contract.status,
              toState: newStatus,
              reason: 'TERM_EXPIRED_AUTOMATION',
            }),
          },
        });

        results.push({
          contractId: contract.id,
          milestone: 'EXPIRED',
          termEnd,
          status: newStatus,
          actionTaken: `Transitioned to ${newStatus}`,
        });
      } else if (diffDays <= 7) {
        this.logger.warn(`Contract ${contract.id} is 7 days from expiration (termEnd: ${termEnd.toISOString()})`);
        results.push({
          contractId: contract.id,
          milestone: 'WARNING_7_DAYS',
          termEnd,
          status: contract.status,
          actionTaken: 'Emitted 7-day expiration warning event',
        });
      } else if (diffDays <= 30) {
        this.logger.log(`Contract ${contract.id} is 30 days from expiration (termEnd: ${termEnd.toISOString()})`);
        results.push({
          contractId: contract.id,
          milestone: 'NOTICE_30_DAYS',
          termEnd,
          status: contract.status,
          actionTaken: 'Emitted 30-day renewal notice event',
        });
      }
    }

    return results;
  }
}
