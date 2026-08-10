import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FreezeControllerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Checks GLOBAL, then TENANT, then CONNECTOR/ACTION_TYPE freezes, in that order — any active match blocks the action. */
  async isFrozen(params: { tenantId: string; actionType: string; connectorScopeRef?: string }): Promise<{ frozen: boolean; reason?: string }> {
    const now = new Date();

    const active = await this.prisma.freeze.findMany({
      where: {
        active_from: { lte: now },
        OR: [{ active_until: null }, { active_until: { gt: now } }],
      },
    });

    const globalFreeze = active.find((f) => f.scope === 'GLOBAL');
    if (globalFreeze) return { frozen: true, reason: `GLOBAL freeze active: ${globalFreeze.reason}` };

    const tenantFreeze = active.find((f) => f.scope === 'TENANT' && f.tenant_id === params.tenantId);
    if (tenantFreeze) return { frozen: true, reason: `TENANT freeze active: ${tenantFreeze.reason}` };

    const actionTypeFreeze = active.find((f) => f.scope === 'ACTION_TYPE' && f.tenant_id === params.tenantId && f.scope_ref === params.actionType);
    if (actionTypeFreeze) return { frozen: true, reason: `ACTION_TYPE freeze active for '${params.actionType}': ${actionTypeFreeze.reason}` };

    if (params.connectorScopeRef) {
      const connectorFreeze = active.find((f) => f.scope === 'CONNECTOR' && f.tenant_id === params.tenantId && f.scope_ref === params.connectorScopeRef);
      if (connectorFreeze) return { frozen: true, reason: `CONNECTOR freeze active: ${connectorFreeze.reason}` };
    }

    return { frozen: false };
  }
}
