import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ShieldCoreClient } from '../../internal-client/shield-core.client';

/**
 * READ-ONLY tools only (spec §16) — disableUser/revokeSession/isolateDevice/
 * blockIp are never exposed here, structurally: there is no method on this
 * class that performs a write. Every call reauthorizes (the caller must
 * already hold a valid authorizationDecisionId) and is recorded as an
 * AiToolCall for audit.
 */
@Injectable()
export class ToolBrokerService {
  private readonly logger = new Logger(ToolBrokerService.name);
  private static readonly ALLOWED_TOOLS = new Set([
    'getCase',
    'getCaseTimeline',
    'getCaseEvidence',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shieldCoreClient: ShieldCoreClient,
  ) {}

  async call(params: {
    tenantId: string;
    toolName: string;
    args: Record<string, unknown>;
    authorizationDecisionId: string;
  }) {
    if (!ToolBrokerService.ALLOWED_TOOLS.has(params.toolName)) {
      throw new ForbiddenException(
        `Tool '${params.toolName}' is not on the read-only allowlist`,
      );
    }

    const argumentsHash = createHash('sha256')
      .update(JSON.stringify(params.args))
      .digest('hex');
    const call = await this.prisma.aiToolCall.create({
      data: {
        tenant_id: params.tenantId,
        tool_name: params.toolName,
        arguments_hash: argumentsHash,
        authorization_decision_id: params.authorizationDecisionId,
        status: 'RUNNING',
      },
    });

    try {
      const result = await this.dispatch(
        params.tenantId,
        params.toolName,
        params.args,
      );
      await this.prisma.aiToolCall.update({
        where: { id: call.id },
        data: { status: 'COMPLETED', completed_at: new Date() },
      });
      return result;
    } catch (err) {
      await this.prisma.aiToolCall.update({
        where: { id: call.id },
        data: {
          status: 'FAILED',
          error_code: (err as Error).message,
          completed_at: new Date(),
        },
      });
      throw err;
    }
  }

  private async dispatch(
    tenantId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    const caseId = args.caseId as string;
    switch (toolName) {
      case 'getCase':
        return this.shieldCoreClient.getCase(tenantId, caseId);
      case 'getCaseTimeline':
        return this.shieldCoreClient.getCaseTimeline(tenantId, caseId);
      case 'getCaseEvidence':
        return this.shieldCoreClient.getCaseEvidence(tenantId, caseId);
      default:
        throw new ForbiddenException(`Tool '${toolName}' has no dispatcher`);
    }
  }
}
