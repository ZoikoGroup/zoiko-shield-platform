import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CorporateTransferService } from './corporate-transfer.service';

@Injectable()
export class CorporateTransferScheduler {
  private readonly logger = new Logger(CorporateTransferScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transferService: CorporateTransferService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async executeDueTransfers(): Promise<{
    attempted: number;
    executed: number;
    failed: number;
  }> {
    const due = await this.prisma.corporateTransfer.findMany({
      where: { status: 'APPROVED', effective_at: { lte: new Date() } },
      select: {
        id: true,
        source_tenant_id: true,
        source_environment_id: true,
      },
      orderBy: { effective_at: 'asc' },
      take: 100,
    });

    const results = await Promise.allSettled(
      due.map((transfer) =>
        this.transferService.executeTransfer(
          transfer.id,
          transfer.source_tenant_id,
          transfer.source_environment_id,
          'system:corporate-transfer-scheduler',
        ),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    failed.forEach((result, index) => {
      this.logger.error(
        `Due corporate transfer execution failed: ${
          result.status === 'rejected'
            ? result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
            : `result-${index}`
        }`,
      );
    });
    return {
      attempted: due.length,
      executed: results.length - failed.length,
      failed: failed.length,
    };
  }
}
